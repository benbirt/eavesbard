// The session and automatic music: listening → transcript → scene check →
// scene state machine → track choice → player, with everything recorded on
// the timeline. Scene checks and track choices are made by Claude or by
// local models (the "engine").
// See DESIGN.md 7.3–7.7 and 7.9.

import { computed, signal } from "@preact/signals";
import { DEFAULT_MODEL } from "./classify/api.js";
import { classify, openingMessage, userMessage, type Classification } from "./classify/classifier.js";
import type { Usage } from "./classify/cost.js";
import { library } from "./library-data.js";
import type { Intensity } from "./library/scenes.js";
import type { LibraryTrack } from "./library/tag-map.js";
import { onTranscriptLine, start as startListening, stop as stopListening } from "./listener.js";
import { LOCAL_MODEL_NAME, localClassify, localModel, prepareLocalModels } from "./local-models.js";
import { hasWebGpu } from "./gpu.js";
import { SCENE_LLM } from "./llm/llm-protocol.js";
import { prepareSceneLlm } from "./llm/scene-llm.js";
import { claudePick } from "./pick/claude-picker.js";
import { localPick } from "./pick/local-picker.js";
import type { PickRequest } from "./pick/request.js";
import { nowPlaying, onTrackEnded, play, stop as stopMusic } from "./player.js";
import { choices, suits } from "./scene/selector.js";
import { initialScene, nextScene, type SceneState } from "./scene/state-machine.js";
import { TranscriptBuffer } from "./scene/transcript-buffer.js";
import { loadApiKey, loadSetting, saveSetting } from "./settings.js";
import { newSession, record, type Engine, type TrackChooser } from "./timeline.js";

/** How often the scene is checked while there's new transcript (DESIGN.md 7.5). */
export const CADENCE_MS = 15_000;
/** How long to wait for the local model to finish downloading before doing without it. */
const LOCAL_WAIT_MS = 8_000;

export interface SessionCost {
  usd: number;
  calls: number;
  /** Share of input tokens served from the prompt cache. */
  cachedShare: number;
}

/** Whether listening drives the music. */
export const auto = signal(loadSetting("auto") !== "off");
/** The chosen engine, local by default; Claude falls back to local without an API key. */
export const engine = signal<Engine>(loadSetting("engine") === "claude" ? "claude" : "local");
/** The opening-scene description, remembered between visits. */
export const description = signal(loadSetting("openingDescription") ?? "");
export const sessionActive = signal(false);
/** The current scene, while automatic music is running. */
export const scene = signal<SceneState | undefined>(undefined);
/** When the scene is next checked, if there's new speech by then. */
export const nextCheckAt = signal<number | undefined>(undefined);
/** Whether speech has arrived since the scene was last checked. */
export const newSpeech = signal(false);
export const checking = signal(false);
export const sessionCost = signal<SessionCost>({ usd: 0, calls: 0, cachedShare: 0 });
let inputTokens = 0;
let cachedTokens = 0;

export const running = computed(() => sessionActive.value && auto.value);

/** The engine actually in charge: Claude needs an API key. */
export function effectiveEngine(): Engine {
  return engine.value === "claude" && !loadApiKey() ? "local" : engine.value;
}

export const ENGINE_NAMES: Record<Engine, string> = { claude: "Claude", local: "Local model" };

// Start downloading the local model as soon as the page opens if it will be
// needed, so it's ready by the time a session starts.
if (auto.value && effectiveEngine() === "local") {
  setTimeout(prepareLocal, 1000);
}

/** Starts the local models downloading: embeddings, and the helper LLM if chosen. */
function prepareLocal(): void {
  prepareLocalModels().catch(() => undefined);
  if (!hasWebGpu) return;
  prepareSceneLlm().catch((err: unknown) => {
    if (sessionActive.value) {
      record({ kind: "error", text: `The scene LLM couldn't load, so the embeddings decide alone: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
}

const buffer = new TranscriptBuffer();
let timer: ReturnType<typeof setInterval> | undefined;
/** Recently played track ids, newest first. */
let recent: number[] = [];
/** The opening description, used for the first track only. */
let openingDescription: string | undefined;

export function setAuto(on: boolean): void {
  auto.value = on;
  saveSetting("auto", on ? "on" : "off");
}

export function setEngine(next: Engine): void {
  engine.value = next;
  saveSetting("engine", next);
}

export function setDescription(text: string): void {
  description.value = text;
  saveSetting("openingDescription", text);
}

/** Starts a session: listening, and (if automatic) the opening scene and its music. */
export async function startSession(): Promise<void> {
  if (sessionActive.value) return;
  newSession();
  sessionActive.value = true;
  const opening = description.value.trim();
  record({ kind: "session", text: opening ? `Session started. Opening scene: “${opening}”.` : "Session started." });
  void startListening();
  if (auto.value) await startAuto(opening);
}

export function stopSession(): void {
  if (!sessionActive.value) return;
  stopListening();
  stopAuto();
  void stopMusic();
  sessionActive.value = false;
  record({ kind: "session", text: "Session stopped." });
}

async function startAuto(opening: string): Promise<void> {
  openingDescription = opening || undefined;
  buffer.clear();
  newSpeech.value = false;
  recent = [];
  inputTokens = cachedTokens = 0;
  sessionCost.value = { usd: 0, calls: 0, cachedShare: 0 };

  const primary = effectiveEngine();
  record({
    kind: "session",
    text:
      `${ENGINE_NAMES[primary]} decides the scene and picks the tracks` +
      (engine.value === "claude" && primary === "local" ? " (no Anthropic API key, so local models are used)." : "."),
  });
  if (primary === "local") {
    prepareLocal();
    const llm = SCENE_LLM.name;
    record(
      hasWebGpu
        ? { kind: "session", text: `Local scene checks blend the embedding model with ${llm}, once it has downloaded.` }
        : { kind: "error", text: `This browser has no WebGPU, so ${llm} can't run: local scene checks use the embedding model alone, which often misses fights ending.` },
    );
  }

  // The opening scene: from the description if there is one, else the default.
  let start: Parameters<typeof initialScene>[1];
  if (opening) {
    const c = await checkScene(primary, "opening", { description: opening }, LOCAL_WAIT_MS);
    if (c) {
      start = {
        setting: c.setting === "unknown" ? initialScene(0).setting : c.setting,
        intensity: c.intensity,
        reason: `from your description “${opening}”`,
      };
    }
  }
  if (!sessionActive.value) return; // Stopped while waiting.
  scene.value = initialScene(Date.now(), start);
  const s = scene.value;
  record({
    kind: "session",
    text: `Opening scene: ${s.setting}, ${s.intensity} (${start ? s.reason : opening ? "default, as the description couldn't be used" : "default; describe the opening scene next time to choose it"}).`,
  });
  playForScene(true, "opening scene");
  nextCheckAt.value = Date.now() + CADENCE_MS;
  timer = setInterval(() => {
    nextCheckAt.value = Date.now() + CADENCE_MS;
    void tick();
  }, CADENCE_MS);
}

function stopAuto(): void {
  clearInterval(timer);
  timer = undefined;
  scene.value = undefined;
  nextCheckAt.value = undefined;
}

onTranscriptLine((line) => {
  if (!timer) return;
  buffer.add({ at: line.time.getTime(), text: line.text });
  newSpeech.value = true;
});

onTrackEnded(() => {
  if (!timer) return;
  record({ kind: "music", text: "Track ended." });
  playForScene(true, "the last track ended");
});

function addCost(usage: Usage, costUsd: number | undefined): void {
  inputTokens += usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  cachedTokens += usage.cache_read_input_tokens ?? 0;
  const c = sessionCost.value;
  sessionCost.value = { usd: c.usd + (costUsd ?? 0), calls: c.calls + 1, cachedShare: inputTokens ? cachedTokens / inputTokens : 0 };
}

/** Rejects if the local model isn't ready within `ms`. */
async function localReady(ms: number | undefined): Promise<void> {
  if (localModel.value.phase === "ready") return;
  const ready = prepareLocalModels();
  if (ms === undefined) return ready;
  await Promise.race([
    ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("still downloading")), ms)),
  ]);
}

type SceneInput = { description: string } | { scene: SceneState; lines: { at: number; text: string }[]; now: number };

/**
 * Asks one engine for the scene and records the answer on the timeline.
 * Returns undefined if it couldn't answer.
 */
async function checkScene(
  by: Engine,
  purpose: "opening" | "scene",
  input: SceneInput,
  localWaitMs?: number,
): Promise<Classification | undefined> {
  checking.value = true;
  const model = by === "claude" ? DEFAULT_MODEL : LOCAL_MODEL_NAME;
  let userText = "";
  try {
    if (by === "claude") {
      const apiKey = loadApiKey();
      if (!apiKey) throw new Error("no API key");
      userText =
        "description" in input
          ? openingMessage(input.description)
          : userMessage(input.scene, input.now - Math.min(input.scene.settingSince, input.scene.intensitySince), input.lines, input.now);
      const result = await classify({ apiKey, model, userText });
      record({ kind: "call", purpose, model, userText, result: result.classification, latencyMs: result.latencyMs, costUsd: result.costUsd, usage: result.usage });
      addCost(result.usage, result.costUsd);
      return result.classification;
    }
    await localReady(localWaitMs);
    const result = await localClassify(
      "description" in input ? input : { lines: input.lines.map((l) => l.text), current: input.scene },
    );
    userText = result.queryText;
    record({ kind: "call", purpose, model: result.model, userText, result: result.classification, latencyMs: result.latencyMs, costUsd: 0 });
    return result.classification;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record({ kind: "call", purpose, model, userText, error: message });
    return undefined;
  } finally {
    checking.value = false;
  }
}

async function tick(): Promise<void> {
  const current = scene.value;
  if (!current || checking.value || !buffer.hasNewText) return;
  buffer.markRead();
  newSpeech.value = false;
  const now = Date.now();
  const input: SceneInput = { scene: current, lines: buffer.window(now), now };
  const c = await checkScene(effectiveEngine(), "scene", input, LOCAL_WAIT_MS);
  const before = scene.value;
  if (!c || !before) return;
  const t = nextScene(before, {
    type: "classification",
    at: Date.now(),
    setting: c.setting,
    settingConfidence: c.settingConfidence,
    intensity: c.intensity,
    intensityConfidence: c.intensityConfidence,
  });
  scene.value = t.state;
  const sceneOf = (s: SceneState) => ({ setting: s.setting, intensity: s.intensity });
  record({ kind: "decision", changed: t.changed, from: sceneOf(before), to: sceneOf(t.state), notes: t.notes });
  if (!t.changed) return;
  if (t.state.intensity !== before.intensity) {
    // Always switch on an intensity change, to something that sounds different.
    playForScene(true, `intensity changed to ${t.state.intensity}`, before.intensity);
  } else {
    playForScene(false, `setting changed to ${t.state.setting}`);
  }
}

/** Bumped for each track request, so a slow pick can't override a newer one. */
let pickSeq = 0;

/**
 * Plays a track for the current scene. Unless `fresh`, the playing track
 * carries on if it suits the scene (used when only the setting changed).
 */
function playForScene(fresh: boolean, why: string, leavingIntensity?: Intensity): void {
  const current = scene.value;
  if (!current) return;
  const playing = nowPlaying.value;
  if (!fresh && playing && suits(playing, current)) {
    record({ kind: "music", text: `${playing.track.title} carries on: it suits ${current.setting} too.`, trackId: playing.track.id });
    return;
  }
  void choose(++pickSeq, current, why, leavingIntensity);
}

const CHOOSER_NAMES: Record<TrackChooser, string> = { claude: "Claude", local: "Local model", random: "Random pick" };

async function choose(seq: number, current: SceneState, why: string, leavingIntensity?: Intensity): Promise<void> {
  const pool = choices(library, current, recent, leavingIntensity);
  if (pool.length === 0) {
    record({ kind: "error", text: `No track found for ${current.setting}, ${current.intensity}.` });
    return;
  }
  const request: PickRequest = {
    why,
    scene: { setting: current.setting, intensity: current.intensity },
    description: why === "opening scene" ? openingDescription : undefined,
    transcript: buffer.window(Date.now()).map((e) => e.text),
    playingId: nowPlaying.value?.track.id,
    recentIds: recent,
  };
  const primary = effectiveEngine();

  // The primary engine, falling back to the local model, then a random pick.
  let picked: { entry: LibraryTrack; by: TrackChooser; reason: string } | undefined;
  for (const by of [...new Set<TrackChooser>([primary, "local", "random"])]) {
    try {
      picked = { by, ...(await pickWith(by, request, pool)) };
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      record(
        message === "still downloading"
          ? { kind: "music", text: `The local model is still downloading, so picking another way this time.` }
          : { kind: "error", text: `${CHOOSER_NAMES[by]} couldn't choose: ${message}` },
      );
    }
  }
  if (!picked || seq !== pickSeq || !scene.value) return; // Superseded or stopped.

  const { entry, by, reason } = picked;
  recent = [entry.track.id, ...recent.filter((id) => id !== entry.track.id)].slice(0, 20);
  const fits = suits(entry, current) ? "" : `; no ${current.setting} track fits, so borrowed from elsewhere`;
  record({
    kind: "music",
    text: `Playing ${entry.track.title} (${why}). ${CHOOSER_NAMES[by]}: ${reason}${fits}.`,
    trackId: entry.track.id,
    chooser: by,
  });
  void play(entry);
}

/** Asks one chooser for a track from `pool`; throws if it can't. */
async function pickWith(
  by: TrackChooser,
  request: PickRequest,
  pool: LibraryTrack[],
): Promise<{ entry: LibraryTrack; reason: string }> {
  switch (by) {
    case "claude": {
      const apiKey = loadApiKey();
      if (!apiKey) throw new Error("no API key");
      let pick;
      try {
        pick = await claudePick(apiKey, request, library.tracks);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        record({ kind: "call", purpose: "pick", model: DEFAULT_MODEL, userText: "", error: message });
        throw err;
      }
      record({
        kind: "call",
        purpose: "pick",
        model: DEFAULT_MODEL,
        userText: pick.userText,
        pick: { trackId: pick.entry.track.id, title: pick.entry.track.title, reason: pick.reason },
        latencyMs: pick.answer.latencyMs,
        costUsd: pick.answer.costUsd,
        usage: pick.answer.usage,
      });
      addCost(pick.answer.usage, pick.answer.costUsd);
      if (!pick.entry.intensities.includes(request.scene.intensity)) {
        throw new Error(`it chose ${pick.entry.track.title}, which doesn't suit ${request.scene.intensity}`);
      }
      return { entry: pick.entry, reason: pick.reason };
    }
    case "local": {
      // The music never waits long for the download.
      await localReady(LOCAL_WAIT_MS);
      const pick = await localPick(request, pool);
      return { entry: pick.entry, reason: `closest match to “${pick.query}” (similarity ${pick.score.toFixed(2)})` };
    }
    case "random": {
      const entry = pool[Math.floor(Math.random() * pool.length)]!;
      return { entry, reason: `random choice from ${pool.length} suitable tracks` };
    }
  }
}

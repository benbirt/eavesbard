// The session and automatic music: listening → transcript → classifier →
// scene state machine → track selector → player, with everything recorded on
// the timeline. See DESIGN.md 7.3–7.7 and 7.9.

import { computed, signal } from "@preact/signals";
import { classify, DEFAULT_MODEL, openingMessage, userMessage, type ClassifyResult } from "./classify/classifier.js";
import { library } from "./library-data.js";
import type { Intensity } from "./library/scenes.js";
import { onTranscriptLine, start as startListening, stop as stopListening } from "./listener.js";
import { nowPlaying, onTrackEnded, play, stop as stopMusic } from "./player.js";
import { choices, suits } from "./scene/selector.js";
import type { LibraryTrack } from "./library/tag-map.js";
import { claudePick } from "./pick/claude-picker.js";
import { localPick, localSearch, prepareLocalSearch } from "./pick/local-picker.js";
import type { PickRequest } from "./pick/request.js";
import { initialScene, nextScene, type SceneState } from "./scene/state-machine.js";
import { TranscriptBuffer } from "./scene/transcript-buffer.js";
import { loadApiKey, loadSetting, saveSetting } from "./settings.js";
import { newSession, record, type TrackChooser } from "./timeline.js";

/** How often the classifier runs while there's new transcript (DESIGN.md 7.5). */
export const CADENCE_MS = 15_000;

export interface SessionCost {
  usd: number;
  calls: number;
  /** Share of input tokens served from the prompt cache. */
  cachedShare: number;
}

/** Whether listening drives the music. */
export const auto = signal(loadSetting("auto") !== "off");
const savedChooser = loadSetting("trackChooser");
/** Who picks each track (DESIGN.md 7.7). */
export const chooser = signal<TrackChooser>(
  savedChooser === "local" || savedChooser === "random" ? savedChooser : "claude",
);
/** Whether the other chooser's pick is recorded alongside, for comparison. */
export const compareChoosers = signal(loadSetting("compareChoosers") !== "off");
/** The opening-scene description, remembered between visits. */
export const description = signal(loadSetting("openingDescription") ?? "");
export const sessionActive = signal(false);
/** The current scene, while automatic music is running. */
export const scene = signal<SceneState | undefined>(undefined);
/** When the classifier next runs, if there's new speech by then. */
export const nextCheckAt = signal<number | undefined>(undefined);
/** Whether speech has arrived since the classifier last ran. */
export const newSpeech = signal(false);
export const classifying = signal(false);
export const sessionCost = signal<SessionCost>({ usd: 0, calls: 0, cachedShare: 0 });
let inputTokens = 0;
let cachedTokens = 0;

const buffer = new TranscriptBuffer();
let timer: ReturnType<typeof setInterval> | undefined;
/** Recently played track ids, newest first. */
let recent: number[] = [];

export const running = computed(() => sessionActive.value && auto.value);

export function setAuto(on: boolean): void {
  auto.value = on;
  saveSetting("auto", on ? "on" : "off");
}

export function setChooser(next: TrackChooser): void {
  chooser.value = next;
  saveSetting("trackChooser", next);
}

export function setCompareChoosers(on: boolean): void {
  compareChoosers.value = on;
  saveSetting("compareChoosers", on ? "on" : "off");
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

/** The opening description, used for the first track only. */
let openingDescription: string | undefined;

async function startAuto(opening: string): Promise<void> {
  openingDescription = opening || undefined;
  if (chooser.value === "local" || compareChoosers.value) {
    // Download and index in the background; failures show on the timeline when used.
    prepareLocalSearch(library.tracks).catch(() => undefined);
  }
  buffer.clear();
  newSpeech.value = false;
  recent = [];
  inputTokens = cachedTokens = 0;
  sessionCost.value = { usd: 0, calls: 0, cachedShare: 0 };
  const apiKey = loadApiKey();
  if (!apiKey) {
    record({ kind: "error", text: "No Anthropic API key (see Settings), so the scene won't change automatically." });
  }

  // The opening scene: from the description if there is one, else the default.
  let start: Parameters<typeof initialScene>[1];
  if (opening && apiKey) {
    const result = await runClassifier("opening", apiKey, openingMessage(opening));
    const c = result?.classification;
    if (c) {
      const fallback = initialScene(0);
      start = {
        setting: c.setting === "unknown" ? fallback.setting : c.setting,
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

/** Calls the classifier and records the call on the timeline. Returns undefined on failure. */
async function runClassifier(purpose: "opening" | "scene", apiKey: string, userText: string): Promise<ClassifyResult | undefined> {
  classifying.value = true;
  try {
    const result = await classify({ apiKey, model: DEFAULT_MODEL, userText });
    record({
      kind: "call",
      purpose,
      model: DEFAULT_MODEL,
      userText,
      result: result.classification,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd,
      usage: result.usage,
    });
    addCost(result);
    return result;
  } catch (err) {
    // A failed call keeps the current scene; playback carries on (DESIGN.md 7.5).
    record({ kind: "call", purpose, model: DEFAULT_MODEL, userText, error: err instanceof Error ? err.message : String(err) });
    return undefined;
  } finally {
    classifying.value = false;
  }
}

function addCost({ usage, costUsd }: Pick<ClassifyResult, "usage" | "costUsd">): void {
  inputTokens += usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  cachedTokens += usage.cache_read_input_tokens ?? 0;
  const c = sessionCost.value;
  sessionCost.value = { usd: c.usd + (costUsd ?? 0), calls: c.calls + 1, cachedShare: inputTokens ? cachedTokens / inputTokens : 0 };
}

async function tick(): Promise<void> {
  const current = scene.value;
  if (!current || classifying.value || !buffer.hasNewText) return;
  const apiKey = loadApiKey();
  if (!apiKey) return;
  buffer.markRead();
  newSpeech.value = false;
  const now = Date.now();
  const userText = userMessage(current, now - Math.min(current.settingSince, current.intensitySince), buffer.window(now), now);
  const result = await runClassifier("scene", apiKey, userText);
  const before = scene.value;
  if (!result || !before) return;
  const c = result.classification;
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
/** How long to wait for local search to finish loading before playing a random track instead. */
const LOCAL_WAIT_MS = 3_000;

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

async function choose(seq: number, current: SceneState, why: string, leavingIntensity?: Intensity): Promise<void> {
  const pool = choices(library, current, recent, leavingIntensity);
  if (pool.length === 0) {
    record({ kind: "error", text: `No track found for ${current.setting}, ${current.intensity}.` });
    return;
  }
  const now = Date.now();
  const request: PickRequest = {
    why,
    scene: { setting: current.setting, intensity: current.intensity },
    description: why === "opening scene" ? openingDescription : undefined,
    transcript: buffer.window(now).map((e) => e.text),
    playingId: nowPlaying.value?.track.id,
    recentIds: recent,
  };
  const apiKey = loadApiKey();
  const primary: TrackChooser = chooser.value === "claude" && !apiKey ? "local" : chooser.value;

  // The primary chooser, falling back to local search, then random.
  const order: TrackChooser[] = [...new Set<TrackChooser>([primary, "local", "random"])];
  let picked: { entry: LibraryTrack; by: TrackChooser; reason: string } | undefined;
  for (const by of order) {
    try {
      // Local search may still be downloading: wait a little, never long.
      const wait = by === "local" ? (by === primary ? 8_000 : LOCAL_WAIT_MS) : undefined;
      picked = { by, ...(await pickWith(by, request, pool, apiKey, wait)) };
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "still loading") {
        record({ kind: "music", text: `${CHOOSER_NAMES[by]} is still downloading, so picking another way this time.` });
      } else {
        record({ kind: "error", text: `${CHOOSER_NAMES[by]} couldn't choose: ${message}` });
      }
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

  // For comparison: what the other chooser would have picked. Never delays the music.
  if (compareChoosers.value) {
    const other: TrackChooser = by === "claude" ? "local" : "claude";
    if (other === "claude" && !apiKey) return;
    pickWith(other, request, pool, apiKey)
      .then((alt) => {
        const same = alt.entry.track.id === entry.track.id;
        record({
          kind: "music",
          text: same
            ? `${CHOOSER_NAMES[other]} agrees: ${alt.entry.track.title}. ${alt.reason}.`
            : `For comparison, ${CHOOSER_NAMES[other].toLowerCase()} would have picked ${alt.entry.track.title}: ${alt.reason}.`,
          trackId: alt.entry.track.id,
          chooser: other,
          comparison: true,
        });
      })
      .catch(() => undefined);
  }
}

const CHOOSER_NAMES: Record<TrackChooser, string> = { claude: "Claude", local: "Local search", random: "Random pick" };

/** Asks one chooser for a track from `pool`; throws if it can't. */
async function pickWith(
  by: TrackChooser,
  request: PickRequest,
  pool: LibraryTrack[],
  apiKey: string | undefined,
  localWaitMs?: number,
): Promise<{ entry: LibraryTrack; reason: string }> {
  switch (by) {
    case "claude": {
      if (!apiKey) throw new Error("no API key");
      try {
        const pick = await claudePick(apiKey, request, library.tracks);
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
        addCost(pick.answer);
        if (!pick.entry.intensities.includes(request.scene.intensity)) {
          throw new Error(`${pick.entry.track.title} doesn't suit ${request.scene.intensity}`);
        }
        return { entry: pick.entry, reason: pick.reason };
      } catch (err) {
        if (err instanceof Error && !/doesn't suit/.test(err.message)) {
          record({ kind: "call", purpose: "pick", model: DEFAULT_MODEL, userText: "", error: err.message });
        }
        throw err;
      }
    }
    case "local": {
      if (localWaitMs !== undefined && localSearch.value.phase !== "ready") {
        // Don't hold up the music for a download; use it once it's ready.
        const ready = prepareLocalSearch(library.tracks);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("still loading")), localWaitMs),
        );
        await Promise.race([ready, timeout]);
      }
      const pick = await localPick(request, pool, library.tracks);
      return { entry: pick.entry, reason: `closest match to “${pick.query}” (similarity ${pick.score.toFixed(2)})` };
    }
    case "random": {
      const entry = pool[Math.floor(Math.random() * pool.length)]!;
      return { entry, reason: `random choice from ${pool.length} suitable tracks` };
    }
  }
}

// The session and automatic music: listening → transcript → classifier →
// scene state machine → track selector → player, with everything recorded on
// the timeline. See DESIGN.md 7.3–7.7 and 7.9.

import { computed, signal } from "@preact/signals";
import { classify, DEFAULT_MODEL, openingMessage, userMessage, type ClassifyResult } from "./classify/classifier.js";
import { library } from "./library-data.js";
import type { Intensity } from "./library/scenes.js";
import { onTranscriptLine, start as startListening, stop as stopListening } from "./listener.js";
import { nowPlaying, onTrackEnded, play } from "./player.js";
import { pickTrack, suits } from "./scene/selector.js";
import { initialScene, nextScene, type SceneState } from "./scene/state-machine.js";
import { TranscriptBuffer } from "./scene/transcript-buffer.js";
import { loadApiKey, loadSetting, saveSetting } from "./settings.js";
import { newSession, record } from "./timeline.js";

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
  sessionActive.value = false;
  record({ kind: "session", text: "Session stopped. The music carries on until you stop it." });
}

async function startAuto(opening: string): Promise<void> {
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

function addCost({ usage, costUsd }: ClassifyResult): void {
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
  const entry = pickTrack(library, current, recent, Math.random, leavingIntensity);
  if (!entry) {
    record({ kind: "error", text: `No track found for ${current.setting}, ${current.intensity}.` });
    return;
  }
  recent = [entry.track.id, ...recent.filter((id) => id !== entry.track.id)].slice(0, 20);
  const fits = suits(entry, current) ? "" : ` (no ${current.setting} track fits, so borrowed from elsewhere)`;
  record({ kind: "music", text: `Playing ${entry.track.title}: ${why}${fits}.`, trackId: entry.track.id });
  void play(entry);
}

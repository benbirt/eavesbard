// Automatic music (M3): transcript → classifier → scene state machine →
// track selector → player. See DESIGN.md 7.3–7.7.

import { effect, signal } from "@preact/signals";
import { classify, DEFAULT_MODEL, type ClassifyResult } from "./classify/classifier.js";
import { library } from "./library-data.js";
import { onTranscriptLine, state as listenState } from "./listener.js";
import { nowPlaying, onTrackEnded, play } from "./player.js";
import { pickTrack, suits } from "./scene/selector.js";
import type { Intensity } from "./library/scenes.js";
import { initialScene, nextScene, type SceneEvent, type SceneState } from "./scene/state-machine.js";
import { TranscriptBuffer } from "./scene/transcript-buffer.js";
import { loadApiKey, loadSetting, saveSetting } from "./settings.js";

/** How often the classifier runs while there's new transcript (DESIGN.md 7.5). */
const CADENCE_MS = 30_000;

export interface ClassifierRun {
  at: Date;
  result?: ClassifyResult;
  error?: string;
}

export interface SessionCost {
  usd: number;
  calls: number;
  /** Calls whose model has no entry in config/pricing.json, so aren't in `usd`. */
  unpriced: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

const EMPTY_COST: SessionCost = { usd: 0, calls: 0, unpriced: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

/** Whether listening drives the music. */
export const auto = signal(loadSetting("auto") !== "off");
/** The current scene, while automatic music is running. */
export const scene = signal<SceneState | undefined>(undefined);
export const lastRun = signal<ClassifierRun | undefined>(undefined);
export const sessionCost = signal<SessionCost>(EMPTY_COST);
/** Something the user should know, e.g. a missing API key. */
export const notice = signal("");

const buffer = new TranscriptBuffer();
let timer: ReturnType<typeof setInterval> | undefined;
let classifying = false;
/** Recently played track ids, newest first. */
let recent: number[] = [];

export function setAuto(on: boolean): void {
  auto.value = on;
  saveSetting("auto", on ? "on" : "off");
}

// Run while listening with automatic music on.
effect(() => {
  const running = auto.value && listenState.value.phase === "listening";
  if (running && !timer) start();
  else if (!running && timer) stop();
});

function start(): void {
  buffer.clear();
  sessionCost.value = EMPTY_COST;
  lastRun.value = undefined;
  scene.value = initialScene(Date.now());
  notice.value = loadApiKey() ? "" : "Add an Anthropic API key in Settings for automatic scene changes; until then the starting scene keeps playing.";
  playForScene(true);
  timer = setInterval(() => void tick(), CADENCE_MS);
}

function stop(): void {
  clearInterval(timer);
  timer = undefined;
  scene.value = undefined;
}

onTranscriptLine((line) => {
  if (!timer) return;
  buffer.add({ at: line.time.getTime(), text: line.text });
});

onTrackEnded(() => {
  if (timer) playForScene(true);
});

async function tick(): Promise<void> {
  const current = scene.value;
  if (!current || classifying || !buffer.hasNewText) return;
  const apiKey = loadApiKey();
  if (!apiKey) return;
  classifying = true;
  buffer.markRead();
  const now = Date.now();
  try {
    const result = await classify({
      apiKey,
      model: DEFAULT_MODEL,
      scene: current,
      sceneForMs: now - Math.min(current.settingSince, current.intensitySince),
      entries: buffer.window(now),
      now,
    });
    lastRun.value = { at: new Date(), result };
    addCost(result);
    const c = result.classification;
    apply({
      type: "classification",
      at: Date.now(),
      setting: c.setting,
      settingConfidence: c.settingConfidence,
      intensity: c.intensity,
      intensityConfidence: c.intensityConfidence,
    });
  } catch (err) {
    // A failed call keeps the current scene; playback carries on (DESIGN.md 7.5).
    lastRun.value = { at: new Date(), error: err instanceof Error ? err.message : String(err) };
  } finally {
    classifying = false;
  }
}

function addCost({ usage, costUsd }: ClassifyResult): void {
  const c = sessionCost.value;
  sessionCost.value = {
    usd: c.usd + (costUsd ?? 0),
    calls: c.calls + 1,
    unpriced: c.unpriced + (costUsd === undefined ? 1 : 0),
    inputTokens: c.inputTokens + usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
    outputTokens: c.outputTokens + usage.output_tokens,
    cacheReadTokens: c.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
  };
}

function apply(event: SceneEvent): void {
  const current = scene.value;
  if (!current) return;
  const { state, changed } = nextScene(current, event);
  scene.value = state;
  if (!changed) return;
  if (state.intensity !== current.intensity) {
    // Always switch on an intensity change, to something that sounds different.
    playForScene(true, current.intensity);
  } else {
    playForScene(false);
  }
}

/**
 * Plays a track for the current scene. Unless `fresh`, the playing track
 * carries on if it suits the scene (used when only the setting changed).
 */
function playForScene(fresh: boolean, leavingIntensity?: Intensity): void {
  const current = scene.value;
  if (!current) return;
  const playing = nowPlaying.value;
  if (!fresh && playing && suits(playing, current)) return;
  const entry = pickTrack(library, current, recent, Math.random, leavingIntensity);
  if (!entry) return;
  recent = [entry.track.id, ...recent.filter((id) => id !== entry.track.id)].slice(0, 20);
  void play(entry);
}

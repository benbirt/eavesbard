// Listening state and actions: microphone → speech-to-text worker → transcript.
// See DESIGN.md 7.2 and 7.10.

import { signal } from "@preact/signals";
import { assetUrl } from "./assets.js";
import { startMic, type Mic } from "./audio/mic.js";
import { gpuAdapter } from "./gpu.js";
import { markDownloaded, mayLoad } from "./downloads.js";
import { loadSetting, saveSetting } from "./settings.js";
import { isWebSpeech, SPEECH_MODELS, whisperRepo, type FromWorker, type SpeechModel, type ToWorker, type WhisperModel } from "./stt/protocol.js";
import { startWebSpeech } from "./stt/web-speech.js";
import { record } from "./timeline.js";

export type ListenState =
  | { phase: "idle" }
  | { phase: "loading"; loaded: number; total: number; preparing: boolean }
  | { phase: "listening" }
  | { phase: "error"; message: string };

export interface TranscriptLine {
  id: number;
  /** Wall-clock time the speech started. */
  time: Date;
  text: string;
  durationS: number;
  /** Set if the hallucination filter dropped this line. */
  dropped?: string;
  latencyMs?: number;
}

export type WakeLockState = "off" | "held" | "lost" | "unsupported";

const savedModel = loadSetting("whisperModel");
export const model = signal<SpeechModel>(
  (SPEECH_MODELS as readonly string[]).includes(savedModel ?? "") ? (savedModel as SpeechModel) : "small.en",
);
export const state = signal<ListenState>({ phase: "idle" });

export type SpeechModelState =
  | { phase: "off" }
  | { phase: "loading"; loaded: number; total: number; preparing: boolean }
  | { phase: "ready" }
  | { phase: "error"; message: string };
/** The Whisper model's download, which starts before listening does (prepareSpeech). */
export const speechModel = signal<SpeechModelState>({ phase: "off" });
export const speaking = signal(false);
/** Oldest first. */
export const transcript = signal<TranscriptLine[]>([]);
export const wakeLock = signal<WakeLockState>("off");

let worker: Worker | undefined;
let workerModel: WhisperModel | undefined;
let mic: Mic | undefined;
let webSpeech: { stop(): void } | undefined;
let startedAt = 0;
let nextId = 0;
let workerReady: Promise<void> | undefined;
let ready: (() => void) | undefined;
let failed: ((err: Error) => void) | undefined;

export function setModel(next: SpeechModel): void {
  model.value = next;
  saveSetting("whisperModel", next);
  prepareSpeech(true);
}

/**
 * Downloads and prepares the chosen Whisper model in the background, like
 * the scene model, so starting a session doesn't wait for it. Web Speech
 * needs nothing.
 */
export function prepareSpeech(onlyCached = false): void {
  const chosen = model.value;
  if (isWebSpeech(chosen) || state.value.phase === "listening" || state.value.phase === "loading") return;
  void (async () => {
    // Without the user's agreement, only a model the browser already has.
    if (onlyCached && !(await mayLoad(whisperRepo(chosen)))) return;
    if (await gpuAdapter()) await loadWorker(chosen);
  })().catch(() => undefined); // Shown in speechModel; start() tries again.
}

function send(message: ToWorker, transfer: Transferable[] = []): void {
  worker?.postMessage(message, transfer);
}

const lineListeners: ((line: TranscriptLine) => void)[] = [];

/** Calls `listener` with each new transcript line the hallucination filter kept. */
export function onTranscriptLine(listener: (line: TranscriptLine) => void): void {
  lineListeners.push(listener);
}

function addLine(line: Omit<TranscriptLine, "id">): void {
  const full = { id: nextId++, ...line };
  transcript.value = [...transcript.value, full];
  record({ kind: "speech", text: full.text, durationS: full.durationS, latencyMs: full.latencyMs, dropped: full.dropped });
  if (!full.dropped) for (const listener of lineListeners) listener(full);
}

function onMessage(message: FromWorker): void {
  switch (message.type) {
    case "progress":
      if (state.value.phase === "loading") {
        state.value = { ...state.value, loaded: message.loaded, total: message.total };
      }
      if (speechModel.value.phase === "loading") {
        speechModel.value = { ...speechModel.value, loaded: message.loaded, total: message.total };
      }
      break;
    case "preparing":
      if (state.value.phase === "loading") state.value = { ...state.value, preparing: true };
      if (speechModel.value.phase === "loading") speechModel.value = { ...speechModel.value, preparing: true };
      break;
    case "ready":
      speechModel.value = { phase: "ready" };
      if (workerModel) markDownloaded(whisperRepo(workerModel));
      ready?.();
      break;
    case "speaking":
      speaking.value = message.speaking;
      break;
    case "transcript":
      addLine({
        time: new Date(startedAt + message.start * 1000),
        text: message.text,
        durationS: message.end - message.start,
        latencyMs: message.latencyMs,
      });
      break;
    case "dropped":
      addLine({
        time: new Date(startedAt + message.start * 1000),
        text: message.text,
        durationS: message.end - message.start,
        dropped: message.reason,
      });
      break;
    case "error":
      if (speechModel.value.phase === "loading") failed?.(new Error(message.message));
      else state.value = { phase: "error", message: message.message };
      record({ kind: "error", text: `Speech-to-text: ${message.message}` });
      break;
  }
}

/** Starts (or reuses) the worker with the chosen model; resolves when it's ready, even if loading began earlier. */
function loadWorker(whisper: WhisperModel): Promise<void> {
  if (worker && workerModel === whisper && workerReady) return workerReady;
  worker?.terminate();
  worker = new Worker(assetUrl("stt-worker.js"), { type: "module" });
  workerModel = whisper;
  speechModel.value = { phase: "loading", loaded: 0, total: 0, preparing: false };
  worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
  worker.onerror = (e) => failed?.(new Error(e.message || "The speech-to-text worker failed to start"));
  const loaded = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = (err) => {
      worker?.terminate();
      worker = undefined;
      workerReady = undefined;
      speechModel.value = { phase: "error", message: err.message };
      reject(err);
    };
  });
  workerReady = loaded;
  send({ type: "load", model: whisper });
  return loaded;
}

export async function start(): Promise<void> {
  if (state.value.phase === "loading" || state.value.phase === "listening") return;
  const chosen = model.value;
  try {
    if (isWebSpeech(chosen)) {
      await startBrowserSpeech(chosen === "webspeech-device");
    } else {
      if (!(await gpuAdapter())) {
        throw new Error("This browser has no WebGPU, which Whisper needs. Use an up-to-date Chrome, or try Web Speech.");
      }
      // Usually already downloaded in the background (prepareSpeech); otherwise wait here.
      const m = speechModel.value;
      if (!(m.phase === "ready" && workerModel === chosen)) {
        state.value = m.phase === "loading" && workerModel === chosen ? { ...m } : { phase: "loading", loaded: 0, total: 0, preparing: false };
      }
      await loadWorker(chosen);
      startedAt = Date.now();
      mic = await startMic((frame) => send({ type: "audio", samples: frame }, [frame.buffer]));
      state.value = { phase: "listening" };
      record({ kind: "session", text: `Listening (Whisper ${chosen}).` });
    }
    await holdWakeLock();
  } catch (err) {
    mic?.stop();
    mic = undefined;
    state.value = { phase: "error", message: describe(err) };
    record({ kind: "error", text: `Couldn't start listening: ${describe(err)}` });
  }
}

/** Listens with the browser's Web Speech API instead of Whisper. */
async function startBrowserSpeech(onDevice: boolean): Promise<void> {
  state.value = { phase: "loading", loaded: 0, total: 0, preparing: true };
  webSpeech = await startWebSpeech(onDevice, {
    onLine: (text, started, ended) => addLine({ time: new Date(started), text, durationS: (ended - started) / 1000 }),
    onSpeaking: (on) => (speaking.value = on),
    onInstalling: () => record({ kind: "session", text: "The browser is downloading its on-device speech model…" }),
    onFatal: (message) => {
      webSpeech = undefined;
      speaking.value = false;
      state.value = { phase: "error", message };
      record({ kind: "error", text: `Speech-to-text: ${message}` });
      void releaseWakeLock();
    },
  });
  if (state.value.phase !== "loading") return; // Failed straight away.
  state.value = { phase: "listening" };
  record({ kind: "session", text: `Listening (Web Speech, ${onDevice ? "on-device" : "cloud"}).` });
}

export function stop(): void {
  mic?.stop();
  mic = undefined;
  webSpeech?.stop();
  webSpeech = undefined;
  send({ type: "flush" });
  speaking.value = false;
  if (state.value.phase !== "error") state.value = { phase: "idle" };
  void releaseWakeLock();
}

export function clearTranscript(): void {
  transcript.value = [];
}

function describe(err: unknown): string {
  if (err instanceof DOMException && err.name === "NotAllowedError") return "Microphone access was refused.";
  if (err instanceof DOMException && err.name === "NotFoundError") return "No microphone was found.";
  return err instanceof Error ? err.message : String(err);
}

// --- Wake lock: keep the screen (and so the machine) awake while listening. ---

let sentinel: WakeLockSentinel | undefined;

async function holdWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) {
    wakeLock.value = "unsupported";
    return;
  }
  try {
    sentinel = await navigator.wakeLock.request("screen");
    wakeLock.value = "held";
    sentinel.addEventListener("release", () => {
      sentinel = undefined;
      if (state.value.phase === "listening") wakeLock.value = "lost";
    });
  } catch {
    wakeLock.value = "lost";
  }
}

async function releaseWakeLock(): Promise<void> {
  const s = sentinel;
  sentinel = undefined;
  wakeLock.value = "off";
  await s?.release().catch(() => undefined);
}

// Chrome drops the lock whenever the tab is hidden; take it again on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.value.phase === "listening" && !sentinel) void holdWakeLock();
});

// Listening state and actions: microphone → speech-to-text worker → transcript.
// See DESIGN.md 7.2 and 7.10.

import { signal } from "@preact/signals";
import { assetUrl } from "./assets.js";
import { startMic, type Mic } from "./audio/mic.js";
import { loadSetting, saveSetting } from "./settings.js";
import { WHISPER_MODELS, type FromWorker, type ToWorker, type WhisperModel } from "./stt/protocol.js";
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
export const model = signal<WhisperModel>(
  (WHISPER_MODELS as readonly string[]).includes(savedModel ?? "") ? (savedModel as WhisperModel) : "base.en",
);
export const state = signal<ListenState>({ phase: "idle" });
export const speaking = signal(false);
/** Oldest first. */
export const transcript = signal<TranscriptLine[]>([]);
export const wakeLock = signal<WakeLockState>("off");

let worker: Worker | undefined;
let workerModel: WhisperModel | undefined;
let mic: Mic | undefined;
let startedAt = 0;
let nextId = 0;
let ready: (() => void) | undefined;
let failed: ((err: Error) => void) | undefined;

export function setModel(next: WhisperModel): void {
  model.value = next;
  saveSetting("whisperModel", next);
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
      break;
    case "preparing":
      if (state.value.phase === "loading") state.value = { ...state.value, preparing: true };
      break;
    case "ready":
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
      if (state.value.phase === "loading") failed?.(new Error(message.message));
      else state.value = { phase: "error", message: message.message };
      record({ kind: "error", text: `Speech-to-text: ${message.message}` });
      break;
  }
}

/** Starts (or reuses) the worker with the chosen model and waits until it's ready. */
function loadWorker(): Promise<void> {
  if (worker && workerModel === model.value) return Promise.resolve();
  worker?.terminate();
  worker = new Worker(assetUrl("stt-worker.js"), { type: "module" });
  workerModel = model.value;
  worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
  worker.onerror = (e) => failed?.(new Error(e.message || "The speech-to-text worker failed to start"));
  const loaded = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = (err) => {
      worker?.terminate();
      worker = undefined;
      reject(err);
    };
  });
  send({ type: "load", model: model.value });
  return loaded;
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return Boolean(gpu && (await gpu.requestAdapter().catch(() => null)));
}

export async function start(): Promise<void> {
  if (state.value.phase === "loading" || state.value.phase === "listening") return;
  try {
    if (!(await hasWebGpu())) {
      throw new Error("This browser has no WebGPU, which speech-to-text needs. Use an up-to-date desktop Chrome.");
    }
    state.value = { phase: "loading", loaded: 0, total: 0, preparing: false };
    await loadWorker();
    startedAt = Date.now();
    mic = await startMic((frame) => send({ type: "audio", samples: frame }, [frame.buffer]));
    state.value = { phase: "listening" };
    record({ kind: "session", text: `Listening (Whisper ${model.value}).` });
    await holdWakeLock();
  } catch (err) {
    mic?.stop();
    mic = undefined;
    state.value = { phase: "error", message: describe(err) };
    record({ kind: "error", text: `Couldn't start listening: ${describe(err)}` });
  }
}

export function stop(): void {
  mic?.stop();
  mic = undefined;
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

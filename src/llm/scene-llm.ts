// The page's side of the scene LLM worker (experiment E9): which model, its
// download state, and asking it about a scene.

import { signal } from "@preact/signals";
import { assetUrl } from "../assets.js";
import type { LlmAnswer } from "../classify/local-classifier.js";
import { fightOverQuestion, llmQuestions, type LlmInput } from "../classify/llm-prompt.js";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { loadSetting, saveSetting } from "../settings.js";
import { SCENE_LLMS, SCENE_LLM_IDS, type FromLlmWorker, type SceneLlm, type ToLlmWorker } from "./llm-protocol.js";

export type SceneLlmState =
  | { phase: "off" }
  | { phase: "loading"; loaded: number; total: number; preparing: boolean }
  | { phase: "ready" }
  | { phase: "error"; message: string };

/** Whether this browser can run the LLM at all. */
export const hasWebGpu = "gpu" in navigator;

function initialChoice(): SceneLlm {
  const saved = loadSetting("sceneLlm");
  return (SCENE_LLM_IDS as string[]).includes(saved ?? "") ? (saved as SceneLlm) : SCENE_LLM_IDS[0]!;
}

/** The LLM blended with the embeddings for local scene checks. */
export const sceneLlmChoice = signal<SceneLlm>(initialChoice());
export const sceneLlm = signal<SceneLlmState>({ phase: "off" });

let worker: Worker | undefined;
let workerModel: SceneLlm | undefined;
let loaded: Promise<void> | undefined;
let nextRequest = 0;
const waiting = new Map<number, { resolve: (probs: number[]) => void; reject: (e: Error) => void }>();

export function setSceneLlm(next: SceneLlm): void {
  sceneLlmChoice.value = next;
  saveSetting("sceneLlm", next);
  if (next !== workerModel) unload();
}

function unload(): void {
  worker?.terminate();
  worker = undefined;
  workerModel = undefined;
  loaded = undefined;
  for (const w of waiting.values()) w.reject(new Error("the model was switched off"));
  waiting.clear();
  sceneLlm.value = { phase: "off" };
}

/** Starts downloading the chosen model, once. Resolves when it's ready. */
export function prepareSceneLlm(): Promise<void> {
  const choice = sceneLlmChoice.value;
  if (!hasWebGpu) return Promise.reject(new Error("this browser has no WebGPU"));
  loaded ??= new Promise<void>((resolve, reject) => {
    sceneLlm.value = { phase: "loading", loaded: 0, total: 0, preparing: false };
    worker = new Worker(assetUrl("llm-worker.js"), { type: "module" });
    workerModel = choice;
    const fail = (message: string) => {
      unload();
      sceneLlm.value = { phase: "error", message };
      reject(new Error(message));
    };
    worker.onerror = (e) => fail(e.message || "The LLM worker failed to start");
    worker.onmessage = (e: MessageEvent<FromLlmWorker>) => {
      const m = e.data;
      const s = sceneLlm.value;
      switch (m.type) {
        case "progress":
          // "preparing" can come between files; more progress means it's still downloading.
          if (s.phase === "loading") sceneLlm.value = { ...s, loaded: m.loaded, total: m.total, preparing: false };
          break;
        case "preparing":
          if (s.phase === "loading") sceneLlm.value = { ...s, preparing: true };
          break;
        case "ready":
          sceneLlm.value = { phase: "ready" };
          resolve();
          break;
        case "answer":
          waiting.get(m.requestId)?.resolve(m.probs);
          waiting.delete(m.requestId);
          break;
        case "error":
          if (m.requestId !== undefined) {
            waiting.get(m.requestId)?.reject(new Error(m.message));
            waiting.delete(m.requestId);
          } else {
            fail(`${SCENE_LLMS[choice].name}: ${m.message}`);
          }
          break;
      }
    };
    send({ type: "load", model: choice });
  });
  return loaded;
}

function send(message: ToLlmWorker): void {
  worker!.postMessage(message);
}

function ask(content: string, labels: string[]): Promise<number[]> {
  const requestId = nextRequest++;
  return new Promise((resolve, reject) => {
    waiting.set(requestId, { resolve, reject });
    send({ type: "ask", requestId, content, labels });
  });
}

/**
 * Asks the LLM about a scene, if it's ready; undefined otherwise
 * (the embeddings then decide alone). Never waits for a download.
 */
export async function askSceneLlm(input: LlmInput): Promise<LlmAnswer | undefined> {
  const choice = sceneLlmChoice.value;
  if (sceneLlm.value.phase !== "ready") return undefined;
  const [settingQ, intensityQ] = llmQuestions(input);
  const setting = await ask(settingQ.content, settingQ.labels);
  const intensity = await ask(intensityQ.content, intensityQ.labels);
  const record = <L extends string>(labels: readonly L[], probs: number[]) =>
    Object.fromEntries(labels.map((l, i) => [l, probs[i] ?? 0])) as Record<L, number>;
  let fightOver: number | undefined;
  if ("lines" in input && input.current.intensity === "combat") {
    const q = fightOverQuestion(input.lines);
    fightOver = (await ask(q.content, q.labels))[1];
  }
  return {
    model: SCENE_LLMS[choice].name,
    setting: record(SETTINGS, setting),
    intensity: record(INTENSITIES, intensity),
    fightOver,
  };
}

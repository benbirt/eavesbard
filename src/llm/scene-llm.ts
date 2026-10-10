// The app's scene LLM (experiment E9): its download state, and asking it
// about a scene.

import { signal } from "@preact/signals";
import type { LlmAnswer } from "../classify/local-classifier.js";
import { ANSWER_PREFIX, fightOverQuestion, llmQuestions, type LlmInput } from "../classify/llm-prompt.js";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { LlmClient } from "./llm-client.js";
import { hasWebGpu } from "../gpu.js";
import { SCENE_LLM } from "./llm-protocol.js";

export type SceneLlmState =
  | { phase: "off" }
  | { phase: "loading"; loaded: number; total: number; preparing: boolean }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export const sceneLlm = signal<SceneLlmState>({ phase: "off" });

let client: LlmClient | undefined;
let loaded: Promise<void> | undefined;

/** Starts downloading the model, once. Resolves when it's ready. */
export function prepareSceneLlm(): Promise<void> {
  if (!hasWebGpu) return Promise.reject(new Error("this browser has no WebGPU"));
  loaded ??= (async () => {
    sceneLlm.value = { phase: "loading", loaded: 0, total: 0, preparing: false };
    client = new LlmClient();
    try {
      await client.load({ repo: SCENE_LLM.repo }, (p) => {
        if (sceneLlm.value.phase !== "loading") return;
        sceneLlm.value = p.preparing ? { ...sceneLlm.value, preparing: true } : { phase: "loading", ...p };
      });
      sceneLlm.value = { phase: "ready" };
    } catch (err) {
      const message = `${SCENE_LLM.name}: ${err instanceof Error ? err.message : String(err)}`;
      client.terminate();
      client = undefined;
      loaded = undefined;
      sceneLlm.value = { phase: "error", message };
      throw new Error(message);
    }
  })();
  return loaded;
}

/** The app's question format: the answer starts "Answer:", then " label" or " Label". */
function ask(q: { content: string; labels: string[] }): Promise<number[]> {
  const spellings = q.labels.map((l) => [` ${l}`, ` ${l[0]!.toUpperCase()}${l.slice(1)}`]);
  return client!.ask(q.content, ANSWER_PREFIX, spellings);
}

/**
 * Asks the LLM about a scene, if it's ready; undefined otherwise
 * (the embeddings then decide alone). Never waits for a download.
 */
export async function askSceneLlm(input: LlmInput): Promise<LlmAnswer | undefined> {
  if (sceneLlm.value.phase !== "ready") return undefined;
  const [settingQ, intensityQ] = llmQuestions(input);
  const setting = await ask(settingQ);
  const intensity = await ask(intensityQ);
  const record = <L extends string>(labels: readonly L[], probs: number[]) =>
    Object.fromEntries(labels.map((l, i) => [l, probs[i] ?? 0])) as Record<L, number>;
  let fightOver: number | undefined;
  if ("lines" in input && input.current.intensity === "combat") {
    fightOver = (await ask(fightOverQuestion(input.lines)))[1];
  }
  return {
    model: SCENE_LLM.name,
    setting: record(SETTINGS, setting),
    intensity: record(INTENSITIES, intensity),
    fightOver,
  };
}

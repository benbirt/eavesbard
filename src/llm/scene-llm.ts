// The page's side of the scene LLM worker (experiment E9): which model, its
// download state, and asking it about a scene.

import { signal } from "@preact/signals";
import type { LlmAnswer } from "../classify/local-classifier.js";
import { ANSWER_PREFIX, fightOverQuestion, llmQuestions, type LlmInput } from "../classify/llm-prompt.js";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { loadSetting, saveSetting } from "../settings.js";
import { LlmClient } from "./llm-client.js";
import { SCENE_LLMS, SCENE_LLM_IDS, type SceneLlm } from "./llm-protocol.js";

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

let client: LlmClient | undefined;
let clientModel: SceneLlm | undefined;
let loaded: Promise<void> | undefined;

export function setSceneLlm(next: SceneLlm): void {
  sceneLlmChoice.value = next;
  saveSetting("sceneLlm", next);
  if (next !== clientModel) unload();
}

function unload(): void {
  client?.terminate();
  client = undefined;
  clientModel = undefined;
  loaded = undefined;
  sceneLlm.value = { phase: "off" };
}

/** Starts downloading the chosen model, once. Resolves when it's ready. */
export function prepareSceneLlm(): Promise<void> {
  const choice = sceneLlmChoice.value;
  if (!hasWebGpu) return Promise.reject(new Error("this browser has no WebGPU"));
  loaded ??= (async () => {
    sceneLlm.value = { phase: "loading", loaded: 0, total: 0, preparing: false };
    client = new LlmClient();
    clientModel = choice;
    const { repo, emptyThought } = SCENE_LLMS[choice];
    try {
      await client.load({ repo, emptyThought }, (p) => {
        if (sceneLlm.value.phase !== "loading") return;
        sceneLlm.value = p.preparing ? { ...sceneLlm.value, preparing: true } : { phase: "loading", ...p };
      });
      sceneLlm.value = { phase: "ready" };
    } catch (err) {
      const message = `${SCENE_LLMS[choice].name}: ${err instanceof Error ? err.message : String(err)}`;
      unload();
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
  const choice = sceneLlmChoice.value;
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
    model: SCENE_LLMS[choice].name,
    setting: record(SETTINGS, setting),
    intensity: record(INTENSITIES, intensity),
    fightOver,
  };
}

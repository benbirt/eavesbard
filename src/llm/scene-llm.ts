// The app's scene LLM (experiment E9): its download state, and asking it
// about a scene.

import { signal } from "@preact/signals";
import type { LlmAnswer } from "../classify/local-classifier.js";
import { ANSWER_PREFIX, DANGER_QUESTION, fightOverQuestion, fightQuestion, llmQuestions, mixIntensity, yesNoQuestion, type LlmInput } from "../classify/llm-prompt.js";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { markDownloaded } from "../downloads.js";
import { LlmClient } from "./llm-client.js";
import { hasWebGpu } from "../gpu.js";
import { SCENE_LLM } from "./llm-protocol.js";
import { record } from "../timeline.js";

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
      markDownloaded(SCENE_LLM.repo);
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
 * If it fails, the timeline says so, once, and again when it recovers.
 */
export async function askSceneLlm(input: LlmInput): Promise<LlmAnswer | undefined> {
  if (sceneLlm.value.phase !== "ready") return undefined;
  try {
    const answer = await askReady(input);
    if (failing) {
      failing = false;
      record({ kind: "session", text: `${SCENE_LLM.name} is answering scene checks again.` });
    }
    return answer;
  } catch (err) {
    // Shown once, not at every check, until it answers again.
    if (!failing) {
      failing = true;
      record({ kind: "error", text: `${SCENE_LLM.name} stopped answering, so the embeddings decide alone: ${err instanceof Error ? err.message : String(err)}` });
    }
    throw err;
  }
}

/** Whether the last question to the LLM failed. */
let failing = false;

async function askReady(input: LlmInput): Promise<LlmAnswer> {
  const [settingQ, intensityQ] = llmQuestions(input);
  const setting = await ask(settingQ);
  const byLabel = <L extends string>(labels: readonly L[], probs: number[]) =>
    Object.fromEntries(labels.map((l, i) => [l, probs[i] ?? 0])) as Record<L, number>;
  // During a session, calm against tense comes from the danger question instead of the three-way one.
  let threeWay: Record<(typeof INTENSITIES)[number], number>;
  if (!("lines" in input)) threeWay = byLabel(INTENSITIES, await ask(intensityQ));
  else {
    // Calm against tense from a yes/no question about danger, in place of the three-way answer's.
    const danger = (await ask(yesNoQuestion(input.current, input.lines, DANGER_QUESTION)))[0]!;
    threeWay = { calm: 1 - danger, tense: danger, combat: 0 };
  }
  let intensity = threeWay;
  let fightOver: number | undefined;
  let fight: { asked: "started" | "ended"; yes: number } | undefined;
  if ("lines" in input) {
    // The chance of combat comes from asking whether a fight has started (or ended).
    const yes = (await ask(fightQuestion(input.lines, input.current)))[0]!;
    const inFight = input.current.intensity === "combat";
    fight = { asked: inFight ? "ended" : "started", yes };
    intensity = mixIntensity(intensity, inFight ? 1 - yes : yes);
    if (inFight) fightOver = (await ask(fightOverQuestion(input.lines)))[1];
  }
  return { model: SCENE_LLM.name, setting: byLabel(SETTINGS, setting), intensity, fightOver, parts: { threeWay, fight } };
}

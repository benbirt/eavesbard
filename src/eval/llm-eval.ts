// The LLM evaluation page (experiment E9): runs the scenario sets through a
// model on this computer's GPU, with each prompt variant, and returns the
// raw answers (embedding similarities and LLM probabilities) so blends can
// be scored offline. Built as //src:eval_site; not deployed. Driven by
// experiments/e9/browser-eval.mjs.

import { ALL_LABEL_KEYS, lastWords, latest } from "../classify/local-classifier.js";
import { LlmClient } from "../llm/llm-client.js";
import type { LlmLoad } from "../llm/llm-protocol.js";
import { prepareLocalModels } from "../local-models.js";
import { rank } from "../pick/embeddings.js";
import { SCENARIOS, type Scenario } from "./scenarios.js";
import { TEST_SET } from "./test-set.js";
import { jsonPrompt, VARIANTS, type VariantInput } from "./llm-variants.js";
import "./stt-eval.js";

export interface SceneResult {
  set: "dev" | "test";
  name: string;
  category?: string;
  /** Embedding similarities to every label description, for the setting and intensity texts. */
  embed: { setting: [string, number][]; intensity: [string, number][] };
  /** Per variant. */
  llm: Record<string, { setting: Record<string, number>; intensity: Record<string, number>; fightOver?: number; ms: number }>;
  /** Free text from the JSON prompt, for checking the prefilled scoring. */
  free?: string;
}

declare global {
  interface Window {
    evalLoad: (model: LlmLoad) => Promise<{ ms: number }>;
    evalRun: (options: { variants: string[]; freeText?: number; sets?: ("dev" | "test")[] }) => Promise<SceneResult[]>;
    evalLog: string[];
  }
}

window.evalLog = [];
const log = (line: string) => {
  window.evalLog.push(line);
  document.body.append(Object.assign(document.createElement("div"), { textContent: line }));
};

let llm: LlmClient | undefined;

window.evalLoad = async (model) => {
  const started = performance.now();
  llm?.terminate();
  llm = new LlmClient();
  let lastPct = -10;
  await Promise.all([
    prepareLocalModels(),
    llm.load(model, (p) => {
      const pct = p.total ? Math.round((100 * p.loaded) / p.total) : 0;
      if (p.preparing) log("preparing on the GPU…");
      else if (pct >= lastPct + 10) log(`downloading ${model.repo}: ${(lastPct = pct)}%`);
    }),
  ]);
  log(`loaded ${model.repo} in ${((performance.now() - started) / 1000).toFixed(0)} s`);
  return { ms: performance.now() - started };
};

function inputOf(s: Scenario): VariantInput {
  return "description" in s.input
    ? { description: s.input.description }
    : { lines: s.input.lines.map(([, text]) => text), current: s.input.scene };
}

const toPairs = (r: { key: string; score: number }[]) => r.map((x) => [x.key, x.score] as [string, number]);

window.evalRun = async ({ variants, freeText = 0, sets = ["dev", "test"] }) => {
  const scenes = [
    ...(sets.includes("dev") ? SCENARIOS.map((s) => ({ set: "dev" as const, s })) : []),
    ...(sets.includes("test") ? TEST_SET.map((s) => ({ set: "test" as const, s })) : []),
  ];
  const results: SceneResult[] = [];
  for (const [n, { set, s }] of scenes.entries()) {
    const input = inputOf(s);
    const settingText = "description" in input ? input.description : lastWords(input.lines, 150);
    const intensityText = "description" in input ? input.description : latest(input.lines);
    const result: SceneResult = {
      set,
      name: s.name,
      category: s.category,
      embed: {
        setting: toPairs(await rank(settingText, ALL_LABEL_KEYS)),
        intensity: toPairs(await rank(intensityText, ALL_LABEL_KEYS)),
      },
      llm: {},
    };
    for (const v of variants) {
      const started = performance.now();
      const answer = await VARIANTS[v]!(llm!, input);
      result.llm[v] = { ...answer, ms: performance.now() - started };
    }
    if (n < freeText) result.free = await llm!.generate(jsonPrompt(input, { meanings: true, withCurrent: true, offTopic: true }), 30);
    results.push(result);
    if (n % 10 === 0) log(`${n + 1}/${scenes.length} ${s.name}`);
  }
  return results;
};

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
import { ANSWER_PREFIX, llmQuestions } from "../classify/llm-prompt.js";
import { SCENARIOS, type Scenario } from "./scenarios.js";
import { LARGE_SET } from "./large-set.js";
import { TEST_SET } from "./test-set.js";
import { jsonPrompt, thoughts, VARIANTS, type VariantInput } from "./llm-variants.js";
import "./stt-eval.js";

export interface SceneResult {
  set: "dev" | "test" | "large";
  name: string;
  category?: string;
  /** Embedding similarities to every label description, for the setting and intensity texts. */
  embed: { setting: [string, number][]; intensity: [string, number][] };
  /** Per variant. */
  llm: Record<string, { setting: Record<string, number>; intensity: Record<string, number>; fightOver?: number; ms: number; thoughts?: string[] }>;
  /** Free text from the JSON prompt, for checking the prefilled scoring. */
  free?: string;
}

export interface ExplainResult {
  axis: string;
  prompt: string;
  /** Label probabilities, as the app scores them. */
  scored: Record<string, number>;
  /** What the model writes when the instruction is appended to the prompt. */
  written: { instruction: string; text: string }[];
}

declare global {
  interface Window {
    evalLoad: (model: LlmLoad) => Promise<{ ms: number }>;
    evalRun: (options: { variants: string[]; freeText?: number; sets?: ("dev" | "test" | "large")[] }) => Promise<SceneResult[]>;
    evalLog: string[];
    /** The app's two questions for `input`, scored as the app does, plus free text for each `extra` instruction. */
    evalExplain: (input: VariantInput, extras: string[]) => Promise<ExplainResult[]>;
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
    ...(sets.includes("large") ? LARGE_SET.map((s) => ({ set: "large" as const, s })) : []),
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
      thoughts.length = 0;
      const answer = await VARIANTS[v]!(llm!, input);
      result.llm[v] = { ...answer, ms: performance.now() - started, ...(thoughts.length ? { thoughts: [...thoughts] } : {}) };
    }
    if (n < freeText) result.free = await llm!.generate(jsonPrompt(input, { meanings: true, withCurrent: true, offTopic: true }), 30);
    results.push(result);
    if (n % 10 === 0) log(`${n + 1}/${scenes.length} ${s.name}`);
  }
  return results;
};

window.evalExplain = async (input, extras) => {
  const out: ExplainResult[] = [];
  for (const q of llmQuestions(input)) {
    const spellings = q.labels.map((l) => [` ${l}`, ` ${l[0]!.toUpperCase()}${l.slice(1)}`]);
    const p = await llm!.ask(q.content, ANSWER_PREFIX, spellings);
    const written = [];
    for (const instruction of extras) {
      const content = q.content.replace("Answer with one word from the list.", instruction);
      written.push({ instruction, text: await llm!.generate(content, 200) });
    }
    out.push({ axis: q.axis, prompt: q.content, scored: Object.fromEntries(q.labels.map((l, i) => [l, p[i]!])), written });
  }
  return out;
};

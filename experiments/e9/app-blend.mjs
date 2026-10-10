// Checks the app's own code path: llm-prompt.ts questions, the worker's scoring
// (mirrored here; the worker itself needs a browser) and the blend in local-classifier.ts.
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { DEV, TEST, LC, embed, dot, lines, current, evaluate, QUERY_PREFIX, REPO } from "./common.mjs";

const P = await import(REPO + "/bazel-bin/src/classify/llm-prompt.js");
const repo = process.argv[2] ?? "onnx-community/Qwen3-1.7B-ONNX";
const tok = await AutoTokenizer.from_pretrained(repo);
const lm = await AutoModelForCausalLM.from_pretrained(repo, { dtype: "q4" });
const encode = (t) => tok.encode(t, { add_special_tokens: false });
const logProbs = (row, ids) => {
  let m = -Infinity;
  for (const x of row) if (x > m) m = x;
  let z = 0;
  for (const x of row) z += Math.exp(x - m);
  return ids.map((id) => row[id] - m - Math.log(z));
};
let slow = 0;
async function ask({ content, labels }) {
  let prompt = tok.apply_chat_template([{ role: "user", content }], { tokenize: false, add_generation_prompt: true });
  if (/Qwen3/.test(repo)) prompt += "<think>\n\n</think>\n\n";
  prompt += P.ANSWER_PREFIX;
  const base = encode(prompt).length;
  const cap = (l) => l[0].toUpperCase() + l.slice(1);
  const firsts = labels.map((l) => [...new Set([` ${l}`, ` ${cap(l)}`].map((w) => encode(prompt + w)[base]))]);
  if (new Set(firsts.flat()).size !== firsts.flat().length) { slow++; throw new Error("slow path needed: " + labels); }
  const { logits } = await lm(tok(prompt, { add_special_tokens: false }));
  const [, rows, vocab] = logits.dims;
  const row = logits.data.subarray((rows - 1) * vocab, rows * vocab);
  return P.labelProbabilities(firsts.map((ids) => logProbs(row, ids)));
}
const docs = LC.labelDocs();
const vecs = await embed(docs.map((d) => d.text));
const scores = async (text) => {
  const [q] = await embed([QUERY_PREFIX + text]);
  return new Map(docs.map((d, i) => [d.key, dot(vecs[i], q)]));
};
const obj = (ks, ps) => Object.fromEntries(ks.map((k, i) => [k, ps[i]]));
async function classify(s) {
  const ls = lines(s);
  const input = "description" in s.input ? { description: s.input.description } : { lines: ls, current: current(s) };
  const [qs, qi] = P.llmQuestions(input);
  const llm = { model: "llm", setting: obj(qs.labels, await ask(qs)), intensity: obj(qi.labels, await ask(qi)) };
  // As in src/llm/scene-llm.ts: during a fight, also ask whether it's over.
  if ("lines" in input && input.current.intensity === "combat") llm.fightOver = (await ask(P.fightOverQuestion(input.lines)))[1];
  const st = "description" in s.input ? s.input.description : LC.lastWords(ls, 150);
  const it = "description" in s.input ? s.input.description : LC.latest(ls);
  return LC.classifyFromScores(await scores(st), await scores(it), { intensity: current(s)?.intensity ?? "calm" }, llm);
}
await evaluate(`app blend with ${repo} — DEV`, DEV, classify, { verbose: true });
await evaluate(`app blend with ${repo} — TEST`, TEST, classify, { verbose: process.argv.includes("-v") });
console.log("slow-path questions:", slow);

// Per-scene probability distributions for each method, cached to dists-<name>.json, for mixing.
import { pipeline } from "@huggingface/transformers";
import { writeFileSync } from "node:fs";
import { DEV, TEST, LC, embed, dot, lines, current, QUERY_PREFIX } from "./common.mjs";
import { SETTING_HYPOTHESES, INTENSITY_HYPOTHESES } from "./nli.mjs";

const ALL = [...DEV, ...TEST];
const S = ["tavern", "town", "interior", "wilderness", "dungeon", "travel"];
const I = ["calm", "tense", "combat"];
const texts = (s) => {
  if ("description" in s.input) return [s.input.description, s.input.description];
  const ls = lines(s);
  return [LC.lastWords(ls, 150), LC.latest(ls)];
};
const softmax = (xs, t = 1) => { const m = Math.max(...xs); const e = xs.map((x) => Math.exp((x - m) / t)); const z = e.reduce((a, b) => a + b); return e.map((x) => x / z); };
const obj = (keys, ps) => Object.fromEntries(keys.map((k, i) => [k, ps[i]]));

async function L() {
  const docs = LC.labelDocs();
  const vecs = await embed(docs.map((d) => d.text));
  const top = async (text, labels) => {
    const [q] = await embed([QUERY_PREFIX + text]);
    return labels.map((l) => Math.max(...docs.map((d, i) => (d.key.startsWith(`label:${l}:`) ? dot(vecs[i], q) : -1))));
  };
  const out = {};
  for (const s of ALL) {
    const [st, it] = texts(s);
    const ss = await top(st, S), is = await top(it, [...I, "offtopic"]);
    const ip = softmax(is, 0.02);
    out[s.name] = { setting: obj(S, softmax(ss, 0.02)), unknown: Math.max(...ss) < 0.54, intensity: obj(I, ip.slice(0, 3)), offtopic: ip[3] };
  }
  return out;
}

async function B(model = "MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33") {
  const zs = await pipeline("zero-shot-classification", model, { dtype: "q8" });
  const dist = async (text, hyps) => {
    const r = await zs(text, Object.values(hyps), { hypothesis_template: "{}", multi_label: false });
    return Object.fromEntries(Object.keys(hyps).map((k) => [k, r.scores[r.labels.indexOf(hyps[k])]]));
  };
  const out = {};
  for (const s of ALL) {
    const [st, it] = texts(s);
    out[s.name] = { setting: await dist(st, SETTING_HYPOTHESES), intensity: await dist(it, INTENSITY_HYPOTHESES) };
  }
  return out;
}

for (const m of process.argv.slice(2)) {
  const out = await { L, B }[m]();
  writeFileSync(`dists-${m}.json`, JSON.stringify(out));
  console.log(m, Object.keys(out).length);
}

// While in combat: ask Gemma directly whether the fight is still going on.
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { writeFileSync } from "node:fs";
import { DEV, TEST, LC, lines, current } from "./common.mjs";
const repo = "onnx-community/gemma-3-4b-it-ONNX";
const tok = await AutoTokenizer.from_pretrained(repo);
const lm = await AutoModelForCausalLM.from_pretrained(repo, { dtype: "q4" });
const enc = (t) => tok.encode(t, { add_special_tokens: false });
const LABELS = { fight: "a fight has started: initiative, attacks, damage, spells at enemies", none: "no fight: talking, exploring, sneaking, travelling, shopping, resting, or the players chatting" };
const keys = Object.keys(LABELS);
async function ask(excerpt) {
  const content = `You are following a tabletop role-playing game (like D&D) from a speech transcript. No fight was going on.\n\nThe last few lines of the transcript (speech recognition, may contain errors):\n"${excerpt}"\n\nHas a fight started?\n${keys.map((k) => `- ${k}: ${LABELS[k]}`).join("\n")}\n\nAnswer with one word from the list.`;
  const prompt = tok.apply_chat_template([{ role: "user", content }], { tokenize: false, add_generation_prompt: true }) + "Answer:";
  const base = enc(prompt).length;
  const ids = keys.map((k) => [...new Set([` ${k}`, ` ${k[0].toUpperCase()}${k.slice(1)}`].map((w) => enc(prompt + w)[base]))]);
  const { logits } = await lm(tok(prompt, { add_special_tokens: false }));
  const [, rows, vocab] = logits.dims;
  const row = logits.data.subarray((rows - 1) * vocab, rows * vocab);
  const mass = ids.map((is) => is.reduce((a, id) => a + Math.exp(row[id]), 0));
  return mass[0] / (mass[0] + mass[1]);
}
const extra = [] && [
  { name: "real: last enemy killed", lines: ["Roll for initiative.", "you killed the last enemy."], over: true },
  { name: "real: combat over", lines: ["Roll for initiative.", "you killed the last enemy.", "Combat over."], over: true },
];
const out = {};
const rows = [];
for (const s of [...DEV, ...TEST].filter((s) => current(s) && current(s).intensity !== "combat")) {
  const p = await ask(LC.lastWords(lines(s), 60));
  out[s.name] = p;
  rows.push({ name: s.name, p, over: s.intensities.includes("combat") });
}
for (const e of []) { const p = await ask(LC.lastWords(e.lines, 60)); out[e.name] = p; rows.push({ name: e.name, p, over: e.over }); }
writeFileSync("fight-start.json", JSON.stringify(out));
for (const r of rows) console.log(`${r.over ? "FIGHT  " : "NONE   "}  p(fight)=${r.p.toFixed(2)}  ${r.name}`);
for (const th of [0.3, 0.5, 0.7, 0.9]) {
  const ok = rows.filter((r) => (r.p >= th) === r.over).length;
  console.log(`threshold ${th}: ${ok}/${rows.length} right (fights over caught ${rows.filter((r) => r.over && r.p >= th).length}/${rows.filter((r) => r.over).length}, fights wrongly ended ${rows.filter((r) => !r.over && r.p >= th).length}/${rows.filter((r) => !r.over).length})`);
}

// Re-asks Gemma's intensity question with different ways of mentioning the current scene.
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "node:fs";
import { DEV, TEST, LC, lines, current } from "./common.mjs";
const repo = "onnx-community/gemma-3-4b-it-ONNX";
const tok = await AutoTokenizer.from_pretrained(repo);
const lm = await AutoModelForCausalLM.from_pretrained(repo, { dtype: "q4" });
const enc = (t) => tok.encode(t, { add_special_tokens: false });
const LABELS = {
  calm: "nothing threatening; talking, exploring, resting, shopping, or the players chatting about the game",
  tense: "danger is close but no fight yet: sneaking, a threat, a chase, a trap, a standoff",
  combat: "a fight is happening right now: initiative, attacks, damage, spells at enemies",
};
const keys = Object.keys(LABELS);
async function ask(context) {
  const menu = keys.map((k) => `- ${k}: ${LABELS[k]}`).join("\n");
  const content = `You are following a tabletop role-playing game (like D&D) from a speech transcript.\n\n${context}\n\nHow intense is the scene right now?\n${menu}\n\nAnswer with one word from the list.`;
  const prompt = tok.apply_chat_template([{ role: "user", content }], { tokenize: false, add_generation_prompt: true }) + "Answer:";
  const base = enc(prompt).length;
  const ids = keys.map((k) => [...new Set([` ${k}`, ` ${k[0].toUpperCase()}${k.slice(1)}`].map((w) => enc(prompt + w)[base]))]);
  const { logits } = await lm(tok(prompt, { add_special_tokens: false }));
  const [, rows, vocab] = logits.dims;
  const row = logits.data.subarray((rows - 1) * vocab, rows * vocab);
  let m = -Infinity; for (const x of row) m = Math.max(m, x);
  let z = 0; for (const x of row) z += Math.exp(x - m);
  const mass = ids.map((is) => is.reduce((a, id) => a + Math.exp(row[id] - m) / z, 0));
  const t = mass.reduce((a, b) => a + b);
  return Object.fromEntries(keys.map((k, i) => [k, mass[i] / t]));
}
const G = JSON.parse(readFileSync("dists-G4.json", "utf8"));
const variants = { noanchor: {}, neutral: {} };
for (const s of [...DEV, ...TEST]) {
  for (const v of Object.keys(variants)) {
    if ("description" in s.input) { variants[v][s.name] = G[s.name]; continue; }
    const cur = current(s);
    const excerpt = `The last few lines of the transcript (speech recognition, may contain errors):\n"${LC.lastWords(lines(s), 60)}"`;
    const context = v === "noanchor" ? excerpt : `Before these lines, the scene was ${cur.intensity}.\n\n${excerpt}`;
    variants[v][s.name] = { setting: G[s.name].setting, intensity: await ask(context) };
  }
}
for (const [v, d] of Object.entries(variants)) writeFileSync(`dists-G4${v}.json`, JSON.stringify(d));
console.log("done");

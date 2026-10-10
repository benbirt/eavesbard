// Gemma's intensity question, worded differently. Saves dists-G4<variant>.json (setting kept from G4).
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "node:fs";
import { DEV, TEST, LC, lines, current } from "./common.mjs";
const repo = "onnx-community/gemma-3-4b-it-ONNX";
const tok = await AutoTokenizer.from_pretrained(repo);
const lm = await AutoModelForCausalLM.from_pretrained(repo, { dtype: "q4" });
const enc = (t) => tok.encode(t, { add_special_tokens: false });
const OLD = { calm: "nothing threatening; talking, exploring, resting, shopping, or the players chatting about the game", tense: "danger is close but no fight yet: sneaking, a threat, a chase, a trap, a standoff", combat: "a fight is happening right now: initiative, attacks, damage, spells at enemies" };
const NEW = { peaceful: OLD.calm, danger: OLD.tense, fight: "a fight has started or is going on: initiative, attacks, damage, spells at enemies" };
const MAP = { peaceful: "calm", danger: "tense", fight: "combat", calm: "calm", tense: "tense", combat: "combat" };
const RULE = "\n\nIf someone calls for initiative, or anyone attacks, a fight has started.";
const V = {
  neutral: { q: "What is happening in the game right now?", labels: OLD, rule: "" },
  words: { q: "What is happening in the game right now?", labels: NEW, rule: "" },
  wordsrule: { q: "What is happening in the game right now?", labels: NEW, rule: RULE },
};
async function ask(context, v) {
  const keys = Object.keys(v.labels);
  const content = `You are following a tabletop role-playing game (like D&D) from a speech transcript.\n\n${context}${v.rule}\n\n${v.q}\n${keys.map((k) => `- ${k}: ${v.labels[k]}`).join("\n")}\n\nAnswer with one word from the list.`;
  const prompt = tok.apply_chat_template([{ role: "user", content }], { tokenize: false, add_generation_prompt: true }) + "Answer:";
  const base = enc(prompt).length;
  const ids = keys.map((k) => [...new Set([` ${k}`, ` ${k[0].toUpperCase()}${k.slice(1)}`].map((w) => enc(prompt + w)[base]))]);
  if (new Set(ids.flat()).size !== ids.flat().length) throw new Error("shared first token " + keys);
  const { logits } = await lm(tok(prompt, { add_special_tokens: false }));
  const [, rows, vocab] = logits.dims;
  const row = logits.data.subarray((rows - 1) * vocab, rows * vocab);
  let m = -Infinity; for (const x of row) m = Math.max(m, x);
  const mass = ids.map((is) => is.reduce((a, id) => a + Math.exp(row[id] - m), 0));
  const z = mass.reduce((a, b) => a + b);
  return Object.fromEntries(keys.map((k, i) => [MAP[k], mass[i] / z]));
}
const G = JSON.parse(readFileSync("dists-G4.json", "utf8"));
for (const [name, v] of Object.entries(V)) {
  const out = {};
  for (const s of [...DEV, ...TEST].filter((s) => G[s.name])) {
    // Same context as the app: description, or the last 60 words plus the current scene.
    const context = "description" in s.input
      ? `The game master describes the opening scene: "${s.input.description}"`
      : `The last few lines of the transcript (speech recognition, may contain errors):\n"${LC.lastWords(lines(s), 60)}"\n\nUntil now the scene was: ${current(s).setting}, ${current(s).intensity}. Keep that answer unless the transcript shows it has changed.`;
    out[s.name] = { setting: G[s.name].setting, intensity: await ask(context, v) };
  }
  writeFileSync(`dists-G4${name}.json`, JSON.stringify(out));
  console.log("saved", name);
}

// The user's prompt: one question for both axes, framed around choosing the soundtrack, JSON out.
// Scored by prefilling the JSON and reading each label's probability; free generation as a check.
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { writeFileSync } from "node:fs";
import { DEV, TEST, lines, current, evaluate } from "./common.mjs";
const repo = "onnx-community/gemma-3-4b-it-ONNX";
const tok = await AutoTokenizer.from_pretrained(repo);
const lm = await AutoModelForCausalLM.from_pretrained(repo, { dtype: "q4" });
const enc = (t) => tok.encode(t, { add_special_tokens: false });
const variant = process.argv[2] ?? "names";
const GENERATE = process.argv.includes("--generate");
const SETTINGS = { tavern: "a tavern or inn", town: "a town, city, village or market, outdoors", interior: "inside a building that is not a tavern: castle, temple, mansion, shop, library", wilderness: "the wilderness: forest, mountains, swamp, desert, plains", dungeon: "a dungeon, cave, crypt, sewer, mine or ruin", travel: "on the road or at sea, journeying between places" };
const INTENSITIES = { calm: "nothing threatening; talking, exploring, resting, shopping, or the players chatting about the game", tense: "danger is close but no fight yet: sneaking, a threat, a chase, a trap, a standoff", combat: "a fight is happening: initiative, attacks, damage, spells at enemies" };
const opts = (d) => (variant === "names" ? Object.keys(d).join(", ") : "\n" + Object.entries(d).map(([k, v]) => `- ${k}: ${v}`).join("\n"));
function content(s) {
  const what = "description" in s.input
    ? `Opening scene, as described by the game master: ${s.input.description}`
    : `Last 2.5 minutes of transcript:\n${lines(s).join("\n")}`;
  return `We're playing DnD. We need you to identify the current setting & intensity for another system to choose the soundtrack which should currently play.\n\n${what}\n\nSetting options: ${opts(SETTINGS)}\nIntensity options: ${opts(INTENSITIES)}\n\nPlease reply in JSON, i.e. {"setting": "<setting>", "intensity": "<intensity>"}`;
}
async function score(prefix, labels) {
  const base = enc(prefix).length;
  const ids = labels.map((k) => enc(prefix + k)[base]);
  if (new Set(ids).size !== ids.length) throw new Error("shared first token: " + labels);
  const { logits } = await lm(tok(prefix, { add_special_tokens: false }));
  const [, rows, vocab] = logits.dims;
  const row = logits.data.subarray((rows - 1) * vocab, rows * vocab);
  let m = -Infinity; for (const x of row) m = Math.max(m, x);
  const e = ids.map((id) => Math.exp(row[id] - m));
  const z = e.reduce((a, b) => a + b);
  return Object.fromEntries(labels.map((k, i) => [k, e[i] / z]));
}
const argmax = (d) => Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a));
const dists = {};
let agree = 0, generated = 0;
async function classify(s) {
  const chat = tok.apply_chat_template([{ role: "user", content: content(s) }], { tokenize: false, add_generation_prompt: true });
  // Gemma writes JSON in a code fence; prefill exactly what it writes.
  const pre = chat + '```json\n{"setting": "';
  const setting = await score(pre, Object.keys(SETTINGS));
  const [sl, sc] = argmax(setting);
  const intensity = await score(pre + sl + '", "intensity": "', Object.keys(INTENSITIES));
  const [il, ic] = argmax(intensity);
  dists[s.name] = { setting, intensity };
  if (GENERATE) {
    const inputs = tok(chat, { add_special_tokens: false });
    const out = await lm.generate({ ...inputs, max_new_tokens: 24, do_sample: false });
    const text = tok.decode(Array.from(out.data).slice(inputs.input_ids.dims[1]).map(Number));
    generated++;
    if (text.includes(`"${sl}"`) && text.includes(`"${il}"`)) agree++;
    else console.log(`   free text differs for ${s.name}: ${JSON.stringify(text)} vs ${sl}/${il}`);
  }
  return { setting: sl, settingConfidence: sc, intensity: il, intensityConfidence: ic, reason: "" };
}
await evaluate(`soundtrack prompt (${variant}) — DEV`, DEV, classify);
await evaluate(`soundtrack prompt (${variant}) — TEST`, TEST, classify, { verbose: process.argv.includes("-v") });
writeFileSync(`dists-ST${variant}.json`, JSON.stringify(dists));
if (GENERATE) console.log(`free generation agreed with scoring on ${agree}/${generated}`);

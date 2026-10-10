// Approach C: a small instruction-tuned LLM. One forward pass per axis; the answer is read
// from the next-token probabilities of each label's first token (no free generation).
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { writeFileSync } from "node:fs";
import { DEV, TEST, LC, lines, evaluate } from "./common.mjs";

export const SETTINGS = {
  tavern: "a tavern or inn",
  town: "a town, city, village or market, outdoors",
  interior: "inside a building that is not a tavern: castle, temple, mansion, shop, library",
  wilderness: "the wilderness: forest, mountains, swamp, desert, plains",
  dungeon: "a dungeon, cave, crypt, sewer, mine or ruin",
  travel: "on the road or at sea, journeying between places",
};
export const INTENSITIES = {
  calm: "nothing threatening; talking, exploring, resting, shopping, or the players chatting about the game",
  tense: "danger is close but no fight yet: sneaking, a threat, a chase, a trap, a standoff",
  combat: "a fight is happening right now: initiative, attacks, damage, spells at enemies",
};

export const dists = {};
const softmax = (xs) => { const m = Math.max(...xs); const e = xs.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b); return e.map((x) => x / s); };

export async function makeLlm(model, { dtype = "q8", think = false, modelFile, settingWords = 150, intensityWords = 60 } = {}) {
  const tok = await AutoTokenizer.from_pretrained(model);
  const lm = await AutoModelForCausalLM.from_pretrained(model, { dtype, ...(modelFile ? { model_file_name: modelFile } : {}) });
  const firstToken = (w) => tok.encode(w, { add_special_tokens: false })[0];

  const logSoftmaxAt = (data, row, vocab, id) => {
    let m = -Infinity;
    for (let j = 0; j < vocab; j++) m = Math.max(m, data[row * vocab + j]);
    let z = 0;
    for (let j = 0; j < vocab; j++) z += Math.exp(data[row * vocab + j] - m);
    return data[row * vocab + id] - m - Math.log(z);
  };

  // Log-probability of each label's whole token sequence after "Answer:".
  async function ask(question, context, labels) {
    const keys = Object.keys(labels);
    const menu = keys.map((k) => `- ${k}: ${labels[k]}`).join("\n");
    const messages = [
      { role: "user", content: `You are following a tabletop role-playing game (like D&D) from a speech transcript.\n\n${context}\n\n${question}\n${menu}\n\nAnswer with one word from the list.` },
    ];
    let prompt = tok.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
    if (think) prompt += "<think>\n\n</think>\n\n";
    prompt += "Answer:";
    const base = tok.encode(prompt, { add_special_tokens: false }).length;
    // Fast path: one forward pass, summing the probability of " label" and " Label".
    const cap = (k) => k[0].toUpperCase() + k.slice(1);
    const first = (w) => Number(tok.encode(prompt + " " + w, { add_special_tokens: false })[base]);
    const variants = keys.map((k) => [...new Set([first(k), first(cap(k))])]);
    const flat = variants.flat();
    if (new Set(flat).size === flat.length) {
      const inputs = tok(prompt, { add_special_tokens: false });
      const { logits } = await lm(inputs);
      const [, len, vocab] = logits.dims;
      const mass = variants.map((ids) => ids.reduce((a, id) => a + Math.exp(logSoftmaxAt(logits.data, len - 1, vocab, id)), 0));
      const z = mass.reduce((a, b) => a + b);
      const p = mass.map((x) => x / z);
      const best = p.indexOf(Math.max(...p));
      return { label: keys[best], confidence: p[best], p };
    }
    const lp = [];
    for (const k of keys) {
      const inputs = tok(prompt + " " + k, { add_special_tokens: false });
      const ids = Array.from(inputs.input_ids.data).map(Number);
      const { logits } = await lm(inputs);
      const vocab = logits.dims[2];
      let sum = 0;
      for (let t = base; t < ids.length; t++) sum += logSoftmaxAt(logits.data, t - 1, vocab, ids[t]);
      lp.push(sum);
    }
    const p = softmax(lp);
    const best = p.indexOf(Math.max(...p));
    return { label: keys[best], confidence: p[best], p };
  }

  return async (s) => {
    let st, it;
    if ("description" in s.input) {
      st = it = `The game master describes the opening scene: "${s.input.description}"`;
    } else {
      const ls = lines(s);
      const cur = s.input.scene;
      const now = `Until now the scene was: ${cur.setting}, ${cur.intensity}. Keep that answer unless the transcript shows it has changed.`;
      st = `The last few minutes of the transcript (speech recognition, may contain errors):\n"${LC.lastWords(ls, settingWords)}"\n\n${now}`;
      it = `The last few lines of the transcript (speech recognition, may contain errors):\n"${LC.lastWords(ls, intensityWords)}"\n\n${now}`;
    }
    const a = await ask("Where are the characters now?", st, SETTINGS);
    const b = await ask("How intense is the scene right now?", it, INTENSITIES);
    const obj = (ks, ps) => Object.fromEntries(ks.map((k, i) => [k, ps[i]]));
    dists[s.name] = { setting: obj(Object.keys(SETTINGS), a.p), intensity: obj(Object.keys(INTENSITIES), b.p) };
    return { setting: a.label, settingConfidence: a.confidence, intensity: b.label, intensityConfidence: b.confidence, reason: "" };
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dtype = args.find((a) => a.startsWith("--dtype="))?.slice(8) ?? "q8";
  const iw = Number(args.find((a) => a.startsWith("--iw="))?.slice(5) ?? 60);
  for (const m of args.filter((a) => !a.startsWith("-"))) {
    const t = performance.now();
    const modelFile = args.find((a) => a.startsWith("--file="))?.slice(7);
    const c = await makeLlm(m, { dtype, modelFile, think: /Qwen3/.test(m), intensityWords: iw });
    console.log(`(${m} ${dtype} loaded in ${((performance.now() - t) / 1000).toFixed(0)} s)`);
    await evaluate(`C: ${m} — DEV`, DEV, c);
    await evaluate(`C: ${m} — TEST`, TEST, c, { verbose: args.includes("-v") });
    const dump = args.find((a) => a.startsWith("--dump="))?.slice(7);
    if (dump) writeFileSync(`dists-${dump}.json`, JSON.stringify(dists));
  }
}

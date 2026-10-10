// Why does Gemma miss fights starting? Free generation vs first-token scoring, with and without anchors.
import { AutoTokenizer, AutoModelForCausalLM } from "@huggingface/transformers";
import { TEST, LC, lines, current } from "./common.mjs";
const repo = "onnx-community/gemma-3-4b-it-ONNX";
const tok = await AutoTokenizer.from_pretrained(repo);
const lm = await AutoModelForCausalLM.from_pretrained(repo, { dtype: process.env.DTYPE ?? "q4" });
const enc = (t) => tok.encode(t, { add_special_tokens: false });
const scenes = TEST.filter((s) => s.category === "combat starts").slice(0, 5);
const INT = "- calm: nothing threatening; talking, exploring, resting, shopping, or the players chatting about the game\n- tense: danger is close but no fight yet: sneaking, a threat, a chase, a trap, a standoff\n- combat: a fight is happening right now: initiative, attacks, damage, spells at enemies";
const prompts = {
  anchored: (s) => `You are following a tabletop role-playing game (like D&D) from a speech transcript.\n\nThe last few lines of the transcript (speech recognition, may contain errors):\n"${LC.lastWords(lines(s), 60)}"\n\nUntil now the scene was: ${current(s).setting}, ${current(s).intensity}. Keep that answer unless the transcript shows it has changed.\n\nHow intense is the scene right now?\n${INT}\n\nAnswer with one word from the list.`,
  plain: (s) => `You are following a tabletop role-playing game (like D&D) from a speech transcript.\n\nThe last few lines of the transcript (speech recognition, may contain errors):\n"${LC.lastWords(lines(s), 60)}"\n\nHow intense is the scene right now?\n${INT}\n\nAnswer with one word from the list.`,
};
for (const s of scenes) {
  console.log(`\n### ${s.name} (was ${current(s).intensity}): "${LC.lastWords(lines(s), 60)}"`);
  for (const [name, p] of Object.entries(prompts)) {
    const chat = tok.apply_chat_template([{ role: "user", content: p(s) }], { tokenize: false, add_generation_prompt: true });
    const inputs = tok(chat, { add_special_tokens: false });
    const out = await lm.generate({ ...inputs, max_new_tokens: 6, do_sample: false });
    const gen = tok.decode(Array.from(out.data).slice(inputs.input_ids.dims[1]).map(Number));
    // Scoring as in the app.
    const prompt = chat + "Answer:";
    const base = enc(prompt).length;
    const { logits } = await lm(tok(prompt, { add_special_tokens: false }));
    const [, rows, vocab] = logits.dims;
    const row = Array.from(logits.data.subarray((rows - 1) * vocab, rows * vocab));
    const top = row.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([v, i]) => JSON.stringify(tok.decode([i])));
    const lab = ["calm", "tense", "combat"].map((k) => `${k}:${row[enc(prompt + " " + k)[base]].toFixed(1)}`);
    console.log(`  ${name.padEnd(8)} free: ${JSON.stringify(gen)}  | after "Answer:" top tokens ${top.join(" ")}  | label logits ${lab.join(" ")}`);
  }
}

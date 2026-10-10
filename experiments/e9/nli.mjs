// Approach B: zero-shot entailment ("does the transcript imply this?") with label definitions only.
import { pipeline } from "@huggingface/transformers";
import { DEV, TEST, LC, lines, current, evaluate } from "./common.mjs";

export const SETTING_HYPOTHESES = {
  tavern: "This takes place in a tavern or inn.",
  town: "This takes place in a town, city or village.",
  interior: "This takes place inside a building such as a castle, temple, mansion or library.",
  wilderness: "This takes place in the wilderness, such as a forest, mountains, swamp or desert.",
  dungeon: "This takes place in a dungeon, cave, crypt, mine or ruin.",
  travel: "The characters are travelling on a journey by road or by ship.",
};
export const INTENSITY_HYPOTHESES = {
  calm: "Nothing dangerous is happening.",
  tense: "Danger is near, but no fight has started.",
  combat: "A fight is happening.",
};

export async function makeNli(model, { settingWords = 150, intensityLatest = true } = {}) {
  const zs = await pipeline("zero-shot-classification", model, { dtype: "q8" });
  const ask = async (text, hyps) => {
    const labels = Object.keys(hyps);
    const out = await zs(text, Object.values(hyps), { hypothesis_template: "{}", multi_label: false });
    const best = out.labels[0];
    return { label: labels[Object.values(hyps).indexOf(best)], confidence: out.scores[0] };
  };
  return async (s) => {
    const ls = lines(s);
    const st = "description" in s.input ? s.input.description : LC.lastWords(ls, settingWords);
    const it = "description" in s.input ? s.input.description : intensityLatest ? LC.latest(ls) : LC.lastWords(ls, 60);
    const a = await ask(st, SETTING_HYPOTHESES);
    const b = await ask(it, INTENSITY_HYPOTHESES);
    return { setting: a.label, settingConfidence: a.confidence, intensity: b.label, intensityConfidence: b.confidence, reason: "" };
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const models = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  for (const m of models) {
    const t = performance.now();
    const c = await makeNli(m);
    console.log(`(${m} loaded in ${((performance.now() - t) / 1000).toFixed(0)} s)`);
    await evaluate(`B: ${m} — DEV`, DEV, c);
    await evaluate(`B: ${m} — TEST`, TEST, c, { verbose: process.argv.includes("-v") });
  }
}

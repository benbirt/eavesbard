// Fits a per-model calibration for the yes/no questions (experiments/E13.md,
// round 4): for each question, the threshold on the model's raw answers that
// best separates the labels (the highest balanced accuracy: the mean of the
// rates right on each side), and the shift in log-odds that moves it to 0.5,
// so the app's thresholds (tuned for Gemma 4 E2B) mean the same for any model.
// Fitted on the tuning half of each run given, from what its replay recorded
// (results/<run>.details.json), on steady checks as score.mjs counts them.
//   bazel run //experiments/e13:calibrate -- run1 [run2...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { source } from "../paths.mjs";
import { INTENSITY_GRACE_S, labelsFor } from "./score-lib.mjs";

const here = source("experiments/e13");
/** The tuning half (sim.mjs). */
const TUNE = new Set(["1", "3", "6", "7", "C1E024", "C1E044", "C2E002", "C2E005", "C2E036"]);
const sec = (mss) => {
  const [m, s] = mss.split(":");
  return Number(m) * 60 + Number(s);
};
const logit = (p) => Math.log(p / (1 - p));

/** The threshold with the best balanced accuracy, and that accuracy. */
export function bestThreshold(pos, neg) {
  const cands = [...new Set([...pos, ...neg])].sort((a, b) => a - b);
  let best = { t: 0.5, acc: 0 };
  for (let i = 0; i < cands.length; i++) {
    // Between this value and the next, so ties fall on one side.
    const t = i + 1 < cands.length ? (cands[i] + cands[i + 1]) / 2 : cands[i] + 1e-9;
    const acc = (pos.filter((p) => p > t).length / pos.length + neg.filter((n) => n <= t).length / neg.length) / 2;
    if (acc > best.acc) best = { t, acc };
  }
  return best;
}

/** Each yes/no question's answers on the tuning half of these runs, split by label. */
function collect(names) {
const q = () => ({ pos: [], neg: [] });
const answers = { danger: q(), started: q(), over: q() };
for (const name of names) {
  const run = JSON.parse(readFileSync(join(here, "results", `${name}.json`), "utf8"));
  const details = JSON.parse(readFileSync(join(here, "results", `${name}.details.json`), "utf8"));
  const labels = labelsFor(here, run.set);
  for (const [ep, checks] of Object.entries(details)) {
    if (!TUNE.has(ep)) continue;
    for (const d of checks) {
      let l;
      for (const s of labels[ep]) if (sec(s.from) <= d.t) l = s;
      if (!l || l.skip || l.intensity.length !== 1 || !d.llm?.parts || d.t - sec(l.from) < INTENSITY_GRACE_S) continue;
      const i = l.intensity[0];
      if (d.current?.intensity !== "combat") {
        if (i !== "combat") (i === "tense" ? answers.danger.pos : answers.danger.neg).push(d.llm.parts.threeWay.tense);
        if (d.llm.parts.fight?.asked === "started") (i === "combat" ? answers.started.pos : answers.started.neg).push(d.llm.parts.fight.yes);
      } else if (d.llm.fightOver !== undefined) (i !== "combat" ? answers.over.pos : answers.over.neg).push(d.llm.fightOver);
    }
  }
}
return answers;
}

// --match <runs>: shift so the false alarms match those runs' (Gemma's) at 0.5, rather than the best balanced accuracy.
const argv = process.argv.slice(2);
const m = argv.indexOf("--match");
const reference = m >= 0 ? collect(argv[m + 1].split(",")) : undefined;
const answers = collect(m >= 0 ? argv.filter((_, i) => i !== m && i !== m + 1) : argv);
const rate = (xs, t) => xs.filter((x) => x > t).length / xs.length;
const shifts = {};
for (const [question, { pos, neg }] of Object.entries(answers)) {
  if (!pos.length || !neg.length) continue;
  let { t, acc } = bestThreshold(pos, neg);
  if (reference?.[question]?.neg.length) {
    // The threshold where this model's false alarms match the reference's at 0.5.
    const fpr = rate(reference[question].neg, 0.5);
    const sorted = [...neg].sort((a, b) => b - a);
    t = sorted[Math.min(sorted.length - 1, Math.floor(fpr * sorted.length))] ?? 0.5;
    acc = (rate(pos, t) + 1 - rate(neg, t)) / 2;
    console.log(`${question.padEnd(8)} reference at 0.5: false alarms ${Math.round(fpr * 100)}%, catches ${Math.round(rate(reference[question].pos, 0.5) * 100)}%; this model at ${t.toPrecision(3)}: false alarms ${Math.round(rate(neg, t) * 100)}%, catches ${Math.round(rate(pos, t) * 100)}%`);
  }
  // Keep the shift finite for answers at 0 or 1.
  const tc = Math.min(Math.max(t, 1e-6), 1 - 1e-6);
  shifts[question] = Math.round(-logit(tc) * 100) / 100;
  const at50 = (pos.filter((p) => p > 0.5).length / pos.length + neg.filter((n) => n <= 0.5).length / neg.length) / 2;
  console.log(`${question.padEnd(8)} ${String(pos.length).padStart(5)}/${String(neg.length).padEnd(5)} best threshold ${t.toPrecision(3).padEnd(9)} balanced ${Math.round(acc * 100)}% (at 0.5: ${Math.round(at50 * 100)}%), shift ${shifts[question]}`);
}
console.log(JSON.stringify(shifts));

// How well each question's raw answers separate the labels, whatever the
// threshold (experiments/E13.md, round 4): the area under the ROC curve (AUC),
// 50% for chance and 100% for perfect. A fairer comparison of models than
// replay scores alone, which depend on thresholds tuned for Gemma 4 E2B. Uses
// the per-check answers a replay records (results/<run>.details.json), on
// steady checks only (as score.mjs counts them).
//   danger: the danger question's "yes", on checks outside the app's fights; tense against calm.
//   fight:  "has a fight started?" (outside the app's fights); combat against calm or tense.
//   setting: the setting answer's top label against the labelled setting (accuracy, not AUC).
//   bazel run //experiments/e13:auc -- run1 [run2...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { source } from "../paths.mjs";
import { INTENSITY_GRACE_S, labelsFor, SETTING_GRACE_S } from "./score-lib.mjs";

const here = source("experiments/e13");
const sec = (mss) => {
  const [m, s] = mss.split(":");
  return Number(m) * 60 + Number(s);
};

/** AUC by ranks: the chance a random positive scores above a random negative (ties count half). */
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return undefined;
  const all = [...pos.map((v) => [v, 1]), ...neg.map((v) => [v, 0])].sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j][0] === all[i][0]) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (all[k][1]) rankSum += rank;
    i = j;
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

/** The labelled stretch at time t, and how long since it began. */
function labelAt(stretches, t) {
  let at;
  for (const s of stretches) if (sec(s.from) <= t) at = s;
  return at && { ...at, since: t - sec(at.from) };
}

const top = (o) => Object.entries(o).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
const pct = (x) => (x === undefined ? "–" : `${Math.round(100 * x)}%`);

console.log("run".padEnd(30) + "danger AUC (n)".padStart(17) + "fight AUC (n)".padStart(17) + "setting".padStart(9) + "   checks");
for (const name of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(join(here, "results", `${name}.json`), "utf8"));
  const details = JSON.parse(readFileSync(join(here, "results", `${name}.details.json`), "utf8"));
  const labels = labelsFor(here, run.set);
  const danger = { pos: [], neg: [] };
  const fight = { pos: [], neg: [] };
  let settingOk = 0;
  let settingN = 0;
  let n = 0;
  for (const [ep, checks] of Object.entries(details)) {
    for (const d of checks) {
      const l = labelAt(labels[ep], d.t);
      if (!l || l.skip || !d.llm?.parts) continue;
      n++;
      const outside = d.current?.intensity !== "combat";
      if (l.since >= INTENSITY_GRACE_S && outside && l.intensity.length === 1) {
        const i = l.intensity[0];
        if (i === "tense") danger.pos.push(d.llm.parts.threeWay.tense);
        else if (i === "calm") danger.neg.push(d.llm.parts.threeWay.tense);
        if (d.llm.parts.fight?.asked === "started") (i === "combat" ? fight.pos : fight.neg).push(d.llm.parts.fight.yes);
      }
      if (l.since >= SETTING_GRACE_S) {
        settingN++;
        if (l.setting.includes(top(d.llm.setting))) settingOk++;
      }
    }
  }
  console.log(
    name.padEnd(30) +
      `${pct(auc(danger.pos, danger.neg))} (${danger.pos.length}/${danger.neg.length})`.padStart(17) +
      `${pct(auc(fight.pos, fight.neg))} (${fight.pos.length}/${fight.neg.length})`.padStart(17) +
      pct(settingN ? settingOk / settingN : undefined).padStart(9) +
      `   ${n}`,
  );
}

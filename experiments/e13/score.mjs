// Scores a replay run (replay.mjs) against the reference labels (labels.json, or labels-crd3.json):
// the scene the app was in after each scene check, and what the classifier
// said before the state machine (experiments/E13.md). Given several runs, one
// row each, side by side.
//   bazel run //experiments/e13:score -- experiments/e13/results/run1.json [more runs] [--episodes 1,3]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { given, source } from "../paths.mjs";
import { labelsFor, median, pct, printReport, scoreRun } from "./score-lib.mjs";

const { values: args, positionals } = parseArgs({ options: { episodes: { type: "string" } }, allowPositionals: true });
const only = args.episodes ? new Set(args.episodes.split(",")) : undefined;
const files = positionals.length ? positionals : ["experiments/e13/results/run1.json"];
const score = (file) => {
  const run = JSON.parse(readFileSync(given(file), "utf8"));
  return { run, m: scoreRun(run, labelsFor(source("experiments/e13"), run.set), only) };
};
if (files.length === 1) {
  const { run, m } = score(files[0]);
  printReport(run, m);
} else {
  // "average" weighs calm, tense and combat equally, whatever the mix of play.
  const cols = ["intensity", "setting", "calm", "tense", "combat", "average", "combatDropped", "fightsCalled", "falseCombat"];
  console.log("run".padEnd(34) + cols.map((c) => c.slice(0, 8).padStart(9)).join("") + "  call lag  per check");
  for (const f of files) {
    const { m } = score(f);
    const row = { ...m, average: (m.calm + m.tense + m.combat) / 3 };
    console.log(
      basename(f, ".json").padEnd(34) +
        cols.map((c) => pct(row[c] * 1000, 1000).padStart(9)).join("") +
        `${Math.round(m.callLag)} s`.padStart(10) +
        `${median(m.latencies) ?? "–"} ms`.padStart(11),
    );
  }
}

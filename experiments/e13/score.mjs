// Scores a replay run (replay.mjs) against the reference labels (labels.json, or labels-crd3.json):
// the scene the app was in after each scene check, and what the classifier
// said before the state machine (experiments/E13.md).
//   bazel run //experiments/e13:score -- experiments/e13/results/run1.json [--episodes 1,3]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { given, source } from "../paths.mjs";
import { labelsFor, printReport, scoreRun } from "./score-lib.mjs";

const { values: args, positionals } = parseArgs({ options: { episodes: { type: "string" } }, allowPositionals: true });
const run = JSON.parse(readFileSync(given(positionals[0] ?? "experiments/e13/results/run1.json"), "utf8"));
const only = args.episodes ? new Set(args.episodes.split(",")) : undefined;
printReport(run, scoreRun(run, labelsFor(source("experiments/e13"), run.set), only));

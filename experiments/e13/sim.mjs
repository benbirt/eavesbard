// Tries other ways of deciding the scene, offline, on what a replay recorded
// (replay.mjs saves each local check's raw scores in results/<run>.details.json):
// the embeddings' similarities and Gemma's separate answers. Each variant
// re-runs the app's own blend (classifyFromScores) and state machine
// (nextScene) over those checks with different options, then scores the
// result like score.mjs. (experiments/E13.md)
//
// An approximation: Gemma was asked with the replayed app's scene in its
// prompt ("until now the scene was…"), and asked "has a fight started?" or
// "has it ended?" according to it. Where a variant's scene differs, its
// answers would have differed too; a fight answer to the other question is
// left out. Variants that win here are checked with real replays.
//   bazel run //experiments/e13:sim -- --runs crd3-run2,bardo-run2 [--episodes tune|held|all] [--variants a,b]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { builtModule, source } from "../paths.mjs";
import { labelsFor, pct, scoreRun } from "./score-lib.mjs";

const LC = await builtModule("src/classify/local-classifier.js");
const SM = await builtModule("src/scene/state-machine.js");
const LP = await builtModule("src/classify/llm-prompt.js");

const { values: args } = parseArgs({
  options: {
    runs: { type: "string" },
    episodes: { type: "string", default: "tune" },
    variants: { type: "string" },
    out: { type: "string" },
  },
});
const here = source("experiments/e13");

/** The tuning half; the rest is held out (E13.md, round 3). */
export const TUNE = new Set(["1", "3", "6", "7", "C1E024", "C1E044", "C2E002", "C2E005", "C2E036"]);

const sec = (mss) => {
  const [m, s] = mss.split(":");
  return Number(m) * 60 + Number(s);
};
const top = (d) => Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

/**
 * A variant: options for the app's blend and state machine, and how Gemma's
 * answers are combined. Unset fields keep the app's current behaviour.
 *   llm: "blend" (as shipped) | "off" (embeddings alone) | "only" (Gemma alone, no embeddings)
 *   intensityFrom: "mixed" (the three-way answer, with the fight question's chance of combat; shipped)
 *                | "threeWay" (no fight question) | "fight" (fight question alone decides combat, calm/tense from embeddings)
 *   fightOver: true (shipped) | false (ignore the "is it over?" answer)
 *   tableTalkCalm: count the embeddings' table-talk probability as calm
 *   blend: overrides for LC.BLEND; scene: overrides for SM.DEFAULT_SCENE_OPTIONS
 */
const V = (name, v) => [name, v];
export const VARIANTS = new Map([
  V("shipped", {}),
  // Simpler systems.
  V("embeddings alone", { llm: "off" }),
  V("Gemma alone", { llm: "only" }),
  V("Gemma alone, no fight question", { llm: "only", intensityFrom: "threeWay" }),
  V("Gemma alone, no fight-over question", { llm: "only", fightOver: false }),
  V("Gemma alone, three-way only", { llm: "only", intensityFrom: "threeWay", fightOver: false }),
  V("no fight question", { intensityFrom: "threeWay" }),
  V("no fight-over question", { fightOver: false }),
  V("fight question decides combat", { intensityFrom: "fight" }),
  // Blend weights (Gemma's share: setting, intensity).
  ...[0.25, 0.75].flatMap((s) => [V(`setting weight ${s}`, { blend: { weight: { setting: s, intensity: 0.5 } } })]),
  ...[0.25, 0.75].flatMap((i) => [V(`intensity weight ${i}`, { blend: { weight: { setting: 0.5, intensity: i } } })]),
  V("weights 0.75, 0.75", { blend: { weight: { setting: 0.75, intensity: 0.75 } } }),
  V("softening 1 (none)", { blend: { temperature: 1 } }),
  V("softening 3", { blend: { temperature: 3 } }),
  // Table talk.
  V("table talk as calm", { tableTalkCalm: true }),
  V("table talk ignored", { blend: { offtopic: "ignore" } }),
  V("table talk veto", { blend: { offtopic: "veto" } }),
  // The state machine.
  V("one check at 0.7", { scene: { oneCheckConfidence: 0.7 } }),
  V("one check at 0.9", { scene: { oneCheckConfidence: 0.9 } }),
  V("three agreeing checks", { scene: { agreeingResults: 3 } }),
  V("combat entry 0.5", { scene: { combatEntryConfidence: 0.5 } }),
  V("combat entry 0.7", { scene: { combatEntryConfidence: 0.7 } }),
  V("combat lasts 2 min", { scene: { minCombatMs: 120_000 } }),
  V("setting lasts 5 min", { scene: { minSettingMs: 300_000 } }),
  V("setting lasts 1 min", { scene: { minSettingMs: 60_000 } }),
  V("min confidence 0.6", { scene: { minConfidence: 0.6 } }),
]);

/** Re-decides one recorded check. */
function classify(d, current, v) {
  const settingScores = new Map(Object.entries(d.setting));
  const intensityScores = new Map(Object.entries(d.intensity));
  const blend = { ...LC.BLEND, ...v.blend, weight: { ...LC.BLEND.weight, ...v.blend?.weight } };
  if (v.llm === "off" || !d.llm) return LC.classifyFromScores(settingScores, intensityScores, current);
  const parts = d.llm.parts;
  // Gemma's fight answer was to "has it started?" or "has it ended?", whichever the replayed scene called for.
  const inFight = current.intensity === "combat";
  const fightUsable = parts?.fight && (parts.fight.asked === "ended") === inFight;
  const combatChance = fightUsable ? (inFight ? 1 - parts.fight.yes : parts.fight.yes) : undefined;
  let intensity = d.llm.intensity;
  if (parts) {
    if (v.intensityFrom === "threeWay" || combatChance === undefined) intensity = parts.threeWay;
    else intensity = LP.mixIntensity(parts.threeWay, combatChance);
  }
  // The fight-over answer exists only where the replay was in a fight.
  const fightOver = v.fightOver === false || !inFight || d.current?.intensity !== "combat" ? undefined : d.llm.fightOver;
  const llm = { ...d.llm, intensity, fightOver };
  if (v.llm === "only") return gemmaAlone(llm, current, blend);
  if (v.intensityFrom === "fight" && combatChance !== undefined) {
    // Combat from the fight question alone; calm against tense from the embeddings.
    const c = LC.classifyFromScores(settingScores, intensityScores, current, { ...llm, intensity: parts.threeWay }, blend);
    if (combatChance > 0.5) return { ...c, intensity: "combat", intensityConfidence: combatChance };
    return c.intensity === "combat" ? { ...c, intensity: parts.threeWay.tense > parts.threeWay.calm ? "tense" : "calm", intensityConfidence: 1 - combatChance } : c;
  }
  if (v.tableTalkCalm) {
    // Fold the embeddings' table-talk descriptions into calm, as round 2's candidate C did.
    const calm = new Map(intensityScores);
    for (const [k, s] of intensityScores) if (k.startsWith("label:offtopic:")) calm.set(k.replace("offtopic:", "calm:talk"), s), calm.delete(k);
    return LC.classifyFromScores(settingScores, calm, current, llm, blend);
  }
  return LC.classifyFromScores(settingScores, intensityScores, current, llm, blend);
}

/** Gemma's answer alone, with the same fight-over rule. */
function gemmaAlone(llm, current, blend) {
  const s = top(llm.setting);
  if (current.intensity === "combat" && llm.fightOver !== undefined && llm.fightOver > blend.fightOverThreshold) {
    const after = llm.intensity.tense > llm.intensity.calm ? "tense" : "calm";
    return { setting: s, settingConfidence: llm.setting[s], intensity: after, intensityConfidence: llm.fightOver, reason: "" };
  }
  const i = top(llm.intensity);
  return { setting: s, settingConfidence: llm.setting[s], intensity: i, intensityConfidence: llm.intensity[i], reason: "" };
}

/** Replays one episode's recorded checks through a variant; returns run-like events. */
function simulate(details, first, v) {
  const options = { ...SM.DEFAULT_SCENE_OPTIONS, ...v.scene };
  const t0 = details[0]?.t ?? 0;
  let state = SM.initialScene(t0 * 1000, { setting: first.setting[0], intensity: first.intensity[0], reason: "start" }, options);
  const events = [];
  for (const d of details) {
    const c = classify(d, state, v);
    events.push({ t: d.t, kind: "call", purpose: "scene", model: "sim +", result: c });
    const before = state;
    const tr = SM.nextScene(state, { type: "classification", at: d.t * 1000, ...c }, options);
    state = tr.state;
    events.push({ t: d.t, kind: "decision", changed: tr.changed, from: { setting: before.setting, intensity: before.intensity }, to: { setting: state.setting, intensity: state.intensity } });
  }
  return events;
}

/** Scores a variant over the chosen episodes of each run. */
export function evaluate(runs, v, only) {
  const out = [];
  for (const { run, details, labels } of runs) {
    const sim = { ...run, episodes: {} };
    for (const [ep, data] of Object.entries(run.episodes)) {
      if (only && !only.has(ep)) continue;
      const first = labels[ep].find((s) => !s.skip);
      sim.episodes[ep] = { ...data, events: simulate(details[ep] ?? [], first, v) };
    }
    out.push(scoreRun(sim, labels));
  }
  return out;
}

if (args.runs) {
  const runs = args.runs.split(",").map((name) => {
    const run = JSON.parse(readFileSync(join(here, "results", `${name}.json`), "utf8"));
    const details = JSON.parse(readFileSync(join(here, "results", `${name}.details.json`), "utf8"));
    return { run, details, labels: labelsFor(here, run.set) };
  });
  const all = runs.flatMap(({ run }) => Object.keys(run.episodes));
  const only = new Set(args.episodes === "tune" ? all.filter((e) => TUNE.has(e)) : args.episodes === "held" ? all.filter((e) => !TUNE.has(e)) : args.episodes === "all" ? all : args.episodes.split(","));
  const names = args.variants ? args.variants.split(",") : [...VARIANTS.keys()];
  const rows = [];
  for (const name of names) {
    const scores = evaluate(runs, VARIANTS.get(name), only);
    rows.push({ name, scores });
  }
  // One row per variant: each run's headline figures.
  const cols = ["intensity", "setting", "calm", "tense", "combat", "combatDropped", "fightsCalled", "fightsLeft", "falseCombat"];
  console.log(`episodes: ${[...only].join(", ")}`);
  console.log(["variant".padEnd(38), ...runs.map(({ run }) => `${run.set}: ` + cols.map((c) => c.slice(0, 8).padStart(8)).join(" ")).join(" | ")].join(""));
  for (const { name, scores } of rows) {
    console.log(name.padEnd(38) + scores.map((s, i) => `${runs[i].run.set}: ` + cols.map((c) => pct(s[c] * 1000, 1000).padStart(8)).join(" ")).join(" | "));
  }
  if (args.out) writeFileSync(join(here, "results", args.out), JSON.stringify(rows.map(({ name, scores }) => ({ name, scores: scores.map(({ fights, perEpisode, confusion, total, latencies, ...s }) => ({ ...s, total, confusion })) })), null, 1));
}

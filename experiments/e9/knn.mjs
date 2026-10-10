// Approach A: the closest tracks vote with their setting and intensity buckets.
import { DEV, TEST, library, searchText, LC, embed, dot, lines, current, evaluate, QUERY_PREFIX } from "./common.mjs";
const SETTINGS = ["tavern", "town", "interior", "wilderness", "dungeon", "travel"];
const INTENSITIES = ["calm", "tense", "combat"];
const tvecs = await embed(library.tracks.map(searchText));

function vote(q, k, temp, axis, labels) {
  const sims = library.tracks.map((t, i) => ({ t, s: dot(tvecs[i], q) })).sort((a, b) => b.s - a.s).slice(0, k);
  const tally = Object.fromEntries(labels.map((l) => [l, 0]));
  for (const { t, s } of sims) {
    const w = Math.exp(s / temp);
    const ls = t[axis];
    for (const l of ls) tally[l] += w / ls.length;
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const [label, v] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return { label, confidence: v / total, top: sims[0].s };
}

export function makeKnn({ k = 10, temp = 0.05, minSim = 0.0 } = {}) {
  return async (s) => {
    const ls = lines(s);
    const st = "description" in s.input ? s.input.description : LC.lastWords(ls, 150);
    const it = "description" in s.input ? s.input.description : LC.latest(ls);
    const [qs, qi] = await embed([QUERY_PREFIX + st, QUERY_PREFIX + it]);
    const sv = vote(qs, k, temp, "settings", SETTINGS);
    const iv = vote(qi, k, temp, "intensities", INTENSITIES);
    const unknown = sv.top < minSim;
    return {
      setting: unknown ? "unknown" : sv.label,
      settingConfidence: unknown ? 0 : sv.confidence,
      intensity: iv.label,
      intensityConfidence: iv.confidence,
      reason: "",
    };
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Tune on DEV only.
  let best;
  for (const k of [3, 5, 10, 20, 40]) for (const temp of [0.01, 0.03, 0.1]) for (const minSim of [0, 0.5, 0.55]) {
    const rows = await quiet(() => evaluateSilently(DEV, makeKnn({ k, temp, minSim })));
    const score = rows.filter((r) => r.okS && r.okI).length;
    if (!best || score > best.score) best = { k, temp, minSim, score };
  }
  console.log("best on DEV:", best);
  await evaluate(`A: nearest-track vote k=${best.k} temp=${best.temp} minSim=${best.minSim} — TEST`, TEST, makeKnn(best), { verbose: process.argv.includes("-v") });
}

async function quiet(f) { const log = console.log; console.log = () => {}; try { return await f(); } finally { console.log = log; } }
async function evaluateSilently(set, c) { return evaluate("", set, c); }

// Scores saved browser-eval results (results/*.json): each prompt variant alone
// and blended with the embeddings through the app's own code
// (classifyFromScores), with and without the fight-over answer.
//   bazel build //src:app && node analyse.mjs results/gemma3.json [more.json…]
import { readFileSync } from "node:fs";
const BIN = new URL("../../bazel-bin/src/", import.meta.url).pathname;
const LC = await import(BIN + "classify/local-classifier.js");
const { SCENARIOS } = await import(BIN + "eval/scenarios.js");
const { TEST_SET } = await import(BIN + "eval/test-set.js");
const byName = new Map([...SCENARIOS, ...TEST_SET].map((s) => [s.name, s]));

const current = (s) => ("scene" in s.input ? s.input.scene : undefined);
/** What the state machine would do with a classification (DESIGN.md 7.6). */
function effective(s, c) {
  const cur = current(s);
  if (!cur) return { setting: c.setting === "unknown" ? "tavern" : c.setting, intensity: c.intensity };
  return {
    setting: c.setting === "unknown" || c.settingConfidence < 0.5 ? cur.setting : c.setting,
    intensity: c.intensityConfidence < 0.5 ? cur.intensity : c.intensity,
  };
}
const top = (d) => Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a));

function alone(s, a, fightOver) {
  const [setting, settingConfidence] = top(a.setting);
  let [intensity, intensityConfidence] = top(a.intensity);
  if (current(s)?.intensity === "combat" && fightOver !== undefined && fightOver > LC.FIGHT_OVER_THRESHOLD) {
    intensity = a.intensity.tense > a.intensity.calm ? "tense" : "calm";
    intensityConfidence = fightOver;
  }
  return { setting, settingConfidence, intensity, intensityConfidence };
}
function blended(s, r, a, fightOver) {
  return LC.classifyFromScores(new Map(r.embed.setting), new Map(r.embed.intensity), { intensity: current(s)?.intensity ?? "calm" }, { model: "llm", setting: a.setting, intensity: a.intensity, fightOver });
}
const embeddingsAlone = (s, r) => LC.classifyFromScores(new Map(r.embed.setting), new Map(r.embed.intensity), { intensity: current(s)?.intensity ?? "calm" });

function score(rows, classify) {
  const cats = {};
  let both = 0, set = 0, int = 0;
  for (const r of rows) {
    const s = byName.get(r.name);
    const e = effective(s, classify(s, r));
    const okS = s.settings.includes(e.setting) || (e.setting === current(s)?.setting && s.settings.includes("unknown"));
    const okI = s.intensities.includes(e.intensity);
    both += okS && okI; set += okS; int += okI;
    const c = (cats[r.category ?? "dev"] ??= [0, 0]);
    c[0] += okS && okI; c[1]++;
  }
  const p = (x) => `${Math.round((100 * x) / rows.length)}%`;
  return { both: p(both), setting: p(set), intensity: p(int), cats: Object.fromEntries(Object.entries(cats).map(([k, [o, n]]) => [k, `${Math.round((100 * o) / n)}%`])) };
}

for (const file of process.argv.slice(2)) {
  const { repo, variants, results } = JSON.parse(readFileSync(file, "utf8"));
  const sets = { dev: results.filter((r) => r.set === "dev"), test: results.filter((r) => r.set === "test") };
  const over = (r) => r.llm.current?.fightOver;
  const methods = { "embeddings alone": (s, r) => embeddingsAlone(s, r) };
  for (const v of variants) {
    methods[`${v} alone`] = (s, r) => alone(s, r.llm[v]);
    if (variants.includes("current")) methods[`${v} alone + fight-over`] = (s, r) => alone(s, r.llm[v], over(r));
    methods[`${v} blended`] = (s, r) => blended(s, r, r.llm[v]);
    if (variants.includes("current")) methods[`${v} blended + fight-over`] = (s, r) => blended(s, r, r.llm[v], over(r));
  }
  console.log(`\n## ${repo} (${file})\n`);
  const cats = Object.keys(score(sets.test.length ? sets.test : sets.dev, methods["embeddings alone"]).cats);
  console.log(`| method | DEV both | TEST both | TEST setting | TEST intensity | ${cats.join(" | ")} |`);
  console.log(`|---|---|---|---|---|${cats.map(() => "---").join("|")}|`);
  for (const [name, f] of Object.entries(methods)) {
    const d = sets.dev.length ? score(sets.dev, f).both : "–";
    const t = sets.test.length ? score(sets.test, f) : { both: "–", setting: "–", intensity: "–", cats: {} };
    console.log(`| ${name} | ${d} | ${t.both} | ${t.setting} | ${t.intensity} | ${cats.map((c) => t.cats[c] ?? "–").join(" | ")} |`);
  }
  const free = results.filter((r) => r.free);
  for (const r of free) console.log(`free text, ${r.name}: ${JSON.stringify(r.free)}`);
}

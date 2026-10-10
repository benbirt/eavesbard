import { readFileSync } from "node:fs";
import { DEV, TEST, current, effective } from "./common.mjs";
const G = JSON.parse(readFileSync("dists-G4.json", "utf8"));
const OVER = JSON.parse(readFileSync("fight-over.json", "utf8"));
const argmax = (d) => Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a));
for (const useOver of [false, true]) for (const set of [["DEV", DEV], ["TEST", TEST]]) {
  let ok = 0; const cats = {};
  for (const s of set[1].filter((s) => G[s.name])) {
    const g = G[s.name]; const [sl, sc] = argmax(g.setting); let [il, ic] = argmax(g.intensity);
    if (useOver && current(s)?.intensity === "combat" && OVER[s.name] >= 0.5) { il = g.intensity.tense > g.intensity.calm ? "tense" : "calm"; ic = OVER[s.name]; }
    const e = effective(s, { setting: sl, settingConfidence: sc, intensity: il, intensityConfidence: ic });
    const good = (s.settings.includes(e.setting) || (e.setting === current(s)?.setting && s.settings.includes("unknown"))) && s.intensities.includes(e.intensity);
    ok += good; const c = (cats[s.category ?? "dev"] ??= [0, 0]); c[0] += good; c[1]++;
  }
  console.log(`Gemma alone${useOver ? " + fight-over" : ""} ${set[0]}: ${Math.round((100 * ok) / set[1].filter((s) => G[s.name]).length)}%  ${Object.entries(cats).map(([k, [o, n]]) => `${k} ${Math.round((100 * o) / n)}%`).join(", ")}`);
}

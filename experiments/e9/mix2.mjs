// Intensity blend weight depending on whether the scene is currently in combat.
import { readFileSync } from "node:fs";
import { DEV, TEST, current, effective } from "./common.mjs";
const L = JSON.parse(readFileSync("dists-L.json", "utf8"));
const X = JSON.parse(readFileSync(`dists-${process.argv[2] ?? "G4"}.json`, "utf8"));
const argmax = (d) => Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a));
const T = Number(process.env.T ?? 1);
const temper = (d) => { const e = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.pow(Math.max(v, 1e-12), 1 / T)])); const z = Object.values(e).reduce((a, b) => a + b); return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v / z])); };
const mix = (a, b0, w) => { const b = temper(b0); return Object.fromEntries(Object.keys(b).map((k) => [k, (1 - w) * a[k] + w * b[k]])); };
const OVER = process.env.OVER ? JSON.parse(readFileSync("fight-over.json", "utf8")) : {};
function classify(s, wn, wc) {
  const l = L[s.name], x = X[s.name];
  const [sl, sc] = argmax(mix(l.setting, x.setting, 0.5));
  const inCombat = current(s)?.intensity === "combat";
  const [il, ic] = argmax(mix(l.intensity, x.intensity, inCombat ? wc : wn));
  const off = l.offtopic > Math.max(...Object.values(l.intensity));
  const pOver = OVER[s.name];
  if (inCombat && pOver !== undefined && pOver >= 0.5) {
    // The fight is over: the calmer of the blended non-combat answers.
    const d = mix(l.intensity, x.intensity, wc);
    return { setting: sl, settingConfidence: sc, intensity: d.tense > d.calm ? "tense" : "calm", intensityConfidence: pOver };
  }
  return { setting: sl, settingConfidence: sc, intensity: off ? current(s)?.intensity ?? "calm" : il, intensityConfidence: off ? 0 : ic };
}
function score(set, wn, wc) {
  let b = 0; const cats = {};
  for (const sc of set) {
    const e = effective(sc, classify(sc, wn, wc));
    const ok = (sc.settings.includes(e.setting) || (e.setting === current(sc)?.setting && sc.settings.includes("unknown"))) && sc.intensities.includes(e.intensity);
    b += ok; const c = (cats[sc.category ?? "dev"] ??= [0, 0]); c[0] += ok; c[1]++;
  }
  return { both: Math.round((100 * b) / set.length), cats: Object.entries(cats).map(([k, [o, n]]) => `${k} ${Math.round((100 * o) / n)}%`).join(", ") };
}
for (const wn of [0, 0.25, 0.5]) for (const wc of [0.25, 0.5, 0.75, 1]) {
  const d = score(DEV, wn, wc), t = score(TEST, wn, wc);
  console.log(`LLM weight: not in combat ${wn}, in combat ${wc}  DEV ${d.both}%  TEST ${t.both}%   ${t.cats}`);
}

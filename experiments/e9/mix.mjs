// Mixes cached per-scene distributions: weighted averages per axis, scored on DEV and TEST.
import { readFileSync, existsSync } from "node:fs";
import { DEV, TEST, current, effective } from "./common.mjs";

const load = (m) => JSON.parse(readFileSync(`dists-${m}.json`, "utf8"));
const methods = process.argv.slice(2);
const D = Object.fromEntries(methods.map((m) => [m, load(m)]));
const L = existsSync("dists-L.json") ? load("L") : undefined;

const argmax = (d) => Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a));
const blend = (ds, ws) => {
  const out = {};
  ds.forEach((d, i) => { for (const [k, v] of Object.entries(d)) out[k] = (out[k] ?? 0) + ws[i] * v; });
  return out;
};

// ws: weights per method for setting, wi: for intensity; gates: use L's unknown/offtopic rules.
function classify(s, ws, wi, { gates = true } = {}) {
  const [sl, sc] = argmax(blend(methods.map((m) => D[m][s.name].setting), ws));
  const [il, ic] = argmax(blend(methods.map((m) => D[m][s.name].intensity), wi));
  const l = L?.[s.name];
  const unknown = (gates === true || gates === "unknown") && l?.unknown;
  const off = (gates === true || gates === "offtopic") && l && l.offtopic > Math.max(...Object.values(l.intensity));
  return {
    setting: unknown ? "unknown" : sl, settingConfidence: unknown ? 0 : sc,
    intensity: off ? current(s)?.intensity ?? "calm" : il, intensityConfidence: off ? 0 : ic,
  };
}

function score(set, ws, wi, opts) {
  let s = 0, i = 0, b = 0;
  const cats = {};
  for (const sc of set) {
    const e = effective(sc, classify(sc, ws, wi, opts));
    const okS = sc.settings.includes(e.setting) || (e.setting === current(sc)?.setting && sc.settings.includes("unknown"));
    const okI = sc.intensities.includes(e.intensity);
    s += okS; i += okI; b += okS && okI;
    const c = (cats[sc.category ?? "dev"] ??= [0, 0]); c[0] += okS && okI; c[1]++;
  }
  const n = set.length, p = (x) => Math.round((100 * x) / n);
  return { setting: p(s), intensity: p(i), both: p(b), cats: Object.entries(cats).map(([k, [ok, n]]) => `${k} ${Math.round((100 * ok) / n)}%`).join(", ") };
}

// Weight grid in steps of 0.25 for each axis, over the simplex.
const grid = (k) => {
  if (k === 1) return [[1]];
  const out = [];
  for (let w = 0; w <= 4; w++) for (const rest of grid(k - 1)) { const sum = rest.reduce((a, b) => a + b, 0); if (Math.abs(w / 4 + sum - 1) < 1e-9 || (k > 1 && false)) out.push([w / 4, ...rest]); }
  return out;
};
const simplex = (k) => {
  const out = [];
  const rec = (left, acc) => { if (acc.length === k - 1) return out.push([...acc, left / 4]); for (let w = 0; w <= left; w++) rec(left - w, [...acc, w / 4]); };
  rec(4, []);
  return out;
};

for (const gates of (process.env.GATES ? [process.env.GATES] : [true, false])) {
  const rows = [];
  for (const ws of simplex(methods.length)) for (const wi of simplex(methods.length)) {
    const dev = score(DEV, ws, wi, { gates }), test = score(TEST, ws, wi, { gates });
    rows.push({ ws, wi, dev, test });
  }
  console.log(`\n== ${methods.join(" + ")}  (L's unknown/off-topic gates ${gates ? "on" : "off"})`);
  const fmt = (r) => `setting [${r.ws}] intensity [${r.wi}]  DEV both ${r.dev.both}%  TEST setting ${r.test.setting}% intensity ${r.test.intensity}% both ${r.test.both}%`;
  rows.sort((a, b) => b.dev.both - a.dev.both || b.test.both - a.test.both);
  console.log("best on DEV:  " + fmt(rows[0]) + "\n   " + rows[0].test.cats);
  rows.sort((a, b) => b.test.both - a.test.both);
  console.log("best on TEST (optimistic): " + fmt(rows[0]) + "\n   " + rows[0].test.cats);
  for (const r of rows.filter((r) => r.ws.some((w) => w === 1) && r.wi.some((w) => w === 1) )) if (r.ws.join() === r.wi.join()) console.log("single " + fmt(r));
}

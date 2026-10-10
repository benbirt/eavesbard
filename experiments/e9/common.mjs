// Shared evaluation code: scenarios, library, cached embeddings, scoring.
import { pipeline } from "@huggingface/transformers";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const REPO = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const BIN = REPO + "/bazel-bin/src";
export const { SCENARIOS: DEV } = await import(BIN + "/eval/scenarios.js");
export const { TEST_SET: TEST } = await import(BIN + "/eval/test-set.js");
const { buildLibrary } = await import(BIN + "/library/tag-map.js");
export const { searchText } = await import(BIN + "/library/track-text.js");
export const LC = await import(BIN + "/classify/local-classifier.js");
const tracks = JSON.parse(readFileSync(REPO + "/data/tracks.json", "utf8")).tracks;
export const library = buildLibrary(tracks, JSON.parse(readFileSync(REPO + "/config/tag-map.json", "utf8")));

// --- Embeddings, cached on disk by text ---
const CACHE = new URL("./embed-cache.json", import.meta.url).pathname;
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let extractor;
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
export async function embed(texts) {
  const missing = texts.filter((t) => !cache[t]);
  if (missing.length) {
    extractor ??= await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" });
    for (let i = 0; i < missing.length; i += 16) {
      const out = await extractor(missing.slice(i, i + 16), { pooling: "cls", normalize: true });
      const [rows, dims] = out.dims;
      for (let r = 0; r < rows; r++) cache[missing[i + r]] = Array.from(out.data.slice(r * dims, (r + 1) * dims));
    }
    writeFileSync(CACHE, JSON.stringify(cache));
  }
  return texts.map((t) => cache[t]);
}
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// --- Inputs ---
export const lines = (s) => ("lines" in s.input ? s.input.lines.map(([, t]) => t) : []);
export const current = (s) => ("scene" in s.input ? s.input.scene : undefined);

/** What the state machine would do with a classification (see DESIGN.md 7.6). */
export function effective(s, c) {
  const cur = current(s);
  if (!cur) return { setting: c.setting === "unknown" ? "tavern" : c.setting, intensity: c.intensity };
  return {
    setting: c.setting === "unknown" || c.settingConfidence < 0.5 ? cur.setting : c.setting,
    intensity: c.intensityConfidence < 0.5 ? cur.intensity : c.intensity,
  };
}

/** Scores a classifier over a set; prints per-category accuracy. */
export async function evaluate(name, set, classify, { verbose = false } = {}) {
  const rows = [];
  const started = performance.now();
  for (const s of set) {
    const c = await classify(s);
    const e = effective(s, c);
    const okS = s.settings.includes(e.setting) || (e.setting === current(s)?.setting && s.settings.includes("unknown"));
    const okI = s.intensities.includes(e.intensity);
    rows.push({ s, c, e, okS, okI });
    if (verbose && !(okS && okI)) console.log(`   ✗ ${s.name}: got ${e.setting}/${e.intensity} want ${s.settings.join("|")}/${s.intensities.join("|")}`);
  }
  const ms = (performance.now() - started) / set.length;
  const cats = [...new Set(set.map((s) => s.category ?? "dev"))];
  const pct = (xs, f) => `${Math.round((100 * xs.filter(f).length) / xs.length)}`.padStart(3) + "%";
  const line = (label, xs) => `${label.padEnd(15)} n=${String(xs.length).padStart(3)}  setting ${pct(xs, (r) => r.okS)}  intensity ${pct(xs, (r) => r.okI)}  both ${pct(xs, (r) => r.okS && r.okI)}`;
  console.log(`== ${name}  (${ms.toFixed(0)} ms/scene)`);
  for (const c of cats) console.log("  " + line(c, rows.filter((r) => (r.s.category ?? "dev") === c)));
  console.log("  " + line("ALL", rows));
  return rows;
}

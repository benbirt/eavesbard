// Experiment E11: Whisper against Gemma 4 for speech-to-text, on this
// computer's GPU in headless Chrome. Clips are lines from the held-out scene
// set spoken by macOS voices (`say`), so their text is known; optionally a
// Tabletop Audio track is mixed in underneath.
//   bazel build //src:eval_site //src:app
//   node stt-eval.mjs --models whisper:tiny.en,whisper:base.en,gemma --snr clean,10,0 --name run1
// Needs playwright-core from ../e9 (npm install there first).
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

const { chromium } = createRequire(new URL("../e9/", import.meta.url).pathname)("playwright-core");
const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "whisper:base.en,gemma" },
    snr: { type: "string", default: "clean" },
    clips: { type: "string", default: "60" },
    name: { type: "string", default: "run" },
  },
});
const here = new URL(".", import.meta.url).pathname;
const repo = join(here, "../..");

// --- Clips: test-set lines spoken by a rotating cast of voices. ---
const VOICES = ["Daniel", "Samantha", "Karen", "Moira", "Tessa", "Rishi", "Eddy (English (UK))", "Flo (English (UK))", "Sandy (English (US))", "Fred"];
const { TEST_SET } = await import(join(repo, "bazel-bin/src/eval/test-set.js"));
const lines = [...new Set(TEST_SET.flatMap((s) => ("lines" in s.input ? s.input.lines.map(([, t]) => t) : [])))];
const want = Number(args.clips);
const chosen = Array.from({ length: Math.min(want, lines.length) }, (_, i) => lines[Math.floor((i * lines.length) / want)]);
const audioDir = join(here, "audio");
mkdirSync(audioDir, { recursive: true });
const clips = chosen.map((text, i) => {
  const voice = VOICES[i % VOICES.length];
  // Named by content, so a cached clip always matches its text and voice.
  const name = createHash("sha1").update(`${voice}\n${text}`).digest("hex").slice(0, 12);
  const wav = join(audioDir, `${name}.wav`);
  if (!existsSync(wav)) {
    const aiff = join(audioDir, `${name}.aiff`);
    execFileSync("say", ["-v", voice, "-o", aiff, text]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
    execFileSync("rm", [aiff]);
  }
  return { name, url: `/e11/audio/${name}.wav`, text, voice };
});

// --- Music bed. ---
const music = join(here, "music.mp3");
if (!existsSync(music)) execFileSync("curl", ["-sSfL", "-o", music, "https://sounds.tabletopaudio.com/177_Tavern_Music.mp3"]);

// --- Serve the evaluation page and the clips on a fixed origin (Chrome caches models per origin). ---
const site = join(repo, "bazel-bin/src/eval_site");
const types = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const path = p.startsWith("/e11/") ? join(here, p.slice(5)) : join(site, p);
  if (!existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
}).listen(8765);

const context = await chromium.launchPersistentContext(join(here, "../e9/.chrome-profile"), { channel: "chrome", headless: true });
const page = await context.newPage();
page.setDefaultTimeout(0);
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("http://localhost:8765/llm-eval.html");

// --- Word error rate, after normalising case, punctuation and small numbers. ---
const NUMBERS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
const TENS = { thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function words(text) {
  const raw = text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (w in TENS) {
      const unit = NUMBERS.indexOf(raw[i + 1] ?? "");
      if (unit > 0 && unit < 10) { out.push(String(TENS[w] + unit)); i++; } else out.push(String(TENS[w]));
    } else if (NUMBERS.includes(w)) out.push(String(NUMBERS.indexOf(w)));
    else out.push(w);
  }
  return out;
}
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const out = { clips, runs: [] };
for (const spec of args.models.split(",")) {
  const model = spec.startsWith("whisper:") ? { kind: "whisper", model: spec.slice(8) } : { kind: "gemma", repo: "onnx-community/gemma-4-E2B-it-ONNX" };
  const { ms: loadMs } = await page.evaluate((m) => window.sttLoad(m), model);
  for (const snr of args.snr.split(",")) {
    const results = await page.evaluate((o) => window.sttRun(o), {
      clips,
      ...(snr === "clean" ? {} : { music: { url: "/e11/music.mp3", snrDb: Number(snr) } }),
    });
    let errors = 0, refWords = 0, msTotal = 0, secondsTotal = 0;
    for (const r of results) {
      const ref = words(r.reference), hyp = words(r.transcript);
      r.errors = editDistance(ref, hyp);
      errors += r.errors; refWords += ref.length; msTotal += r.ms; secondsTotal += r.seconds;
    }
    const summary = { model: spec, snr, wer: errors / refWords, msPerClip: msTotal / results.length, realTime: msTotal / 1000 / secondsTotal, loadMs };
    console.log(`${spec.padEnd(18)} ${snr === "clean" ? "clean" : `music at ${snr} dB SNR`}: WER ${(100 * summary.wer).toFixed(1)}%, ${(summary.msPerClip / 1000).toFixed(2)} s per clip (${summary.realTime.toFixed(2)}× real time)`);
    out.runs.push({ ...summary, results });
  }
}
mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "results", `${args.name}.json`), JSON.stringify(out, null, 1));
await context.close();
server.close();

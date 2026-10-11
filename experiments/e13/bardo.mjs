// Replays Bardo's "Call of the Wild" episodes through the real app (//src:site)
// in headless Chrome on this computer's GPU (experiments/E13.md). The page runs
// with ?replay (src/replay.ts): instead of the microphone, each caption line is
// handed to the listener when its speech would have finished, and everything
// after that is the app's own code: the director's 15-second scene checks,
// the embeddings and the scene LLM, the state machine and the track picks.
//
// The page's clock is Playwright's: time flows as usual, so the models and
// workers behave normally, but between lines the clock jumps ahead to the next
// line's time, firing the director's timer on the way; each scene check
// finishes before the replay moves on. Tracks are served as silence, so
// nothing is fetched from Tabletop Audio.
//
// The captions are downloaded at run time into .data/ (not committed: the words
// are the show's). Results keep no transcript text: results/<name>.json.
//   bazel run //experiments/e13:bardo -- --name run1 [--episodes 1,2] [--headed]
// Then score it: bazel run //experiments/e13:score -- experiments/e13/results/run1.json
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";
import { built, chrome, source } from "../paths.mjs";

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    episodes: { type: "string", default: "1,2,3,4,5,6,7,8,9" },
    headed: { type: "boolean", default: false },
    "max-minutes": { type: "string", default: "240" },
  },
});
if (!args.name) {
  console.error("Give the run a --name.");
  process.exit(2);
}
const here = source("experiments/e13");
const labels = JSON.parse(readFileSync(join(here, "labels.json"), "utf8")).episodes;
const episodes = args.episodes.split(",").map((s) => s.trim());

// --- Captions, from Bardo's repository (lucasnfe/bardo-composer, MIT). ---

const CAPTIONS = "https://raw.githubusercontent.com/lucasnfe/bardo-composer/master/data/dnd";
const sec = (mss) => {
  const [m, s] = mss.split(":");
  return Number(m) * 60 + Number(s);
};

/** Caption lines: start and duration in seconds, and the text. */
async function captions(ep) {
  const file = join(here, ".data", `ep${ep}.csv`);
  if (!existsSync(file)) {
    mkdirSync(join(here, ".data"), { recursive: true });
    const res = await fetch(`${CAPTIONS}/ep${ep}.csv`);
    if (!res.ok) throw new Error(`episode ${ep}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  // start,duration,text,valence,arousal; the text may hold commas.
  return readFileSync(file, "utf8")
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .slice(1)
    .map((row) => {
      const f = row.split(",");
      const text = f.slice(2, -2).join(",").replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
      return { start: Number(f[0]), duration: Number(f[1]), text };
    })
    .filter((c) => c.text.trim());
}

// --- The site, served on the evaluation runs' origin (their profile has the models). ---

const site = built("src/site");
const types = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(site) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(8765);

/** Three minutes of silence (8 kHz, 8-bit mono WAV), served for every track. */
function silence(seconds = 180) {
  const n = 8000 * seconds;
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  return b;
}
const quiet = silence();

const context = await chromium.launchPersistentContext(source("experiments/e9/.chrome-profile"), {
  ...chrome,
  headless: !args.headed,
  // WebGPU in headless Chrome on Linux needs Vulkan, here through ANGLE; without
  // these flags it falls back to SwiftShader, a CPU renderer.
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--disable-vulkan-surface",
  ],
});
const fail = (why) => {
  console.error(why);
  process.exit(1);
};
setTimeout(() => fail(`gave up after ${args["max-minutes"]} minutes`), Number(args["max-minutes"]) * 60_000).unref();
let finished = false;
context.on("close", () => finished || fail("Chrome closed"));
await context.route("https://sounds.tabletopaudio.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "audio/wav", body: quiet }),
);
const page = await context.newPage();
page.setDefaultTimeout(0);
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("crash", () => fail("the page crashed"));
page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.error(`console ${m.type()}:`, m.text().slice(0, 400)));
page.on("worker", (w) => w.on("console", (m) => ["error", "warning"].includes(m.type()) && console.error(`worker ${m.type()}:`, m.text().slice(0, 400))));
await page.addInitScript(() => {
  localStorage.setItem("eavesbard.engine", "local");
  localStorage.setItem("eavesbard.auto", "on");
  localStorage.setItem("eavesbard.compare", "off");
  localStorage.setItem("eavesbard.openingDescription", "");
});
await page.clock.install();
await page.goto("http://localhost:8765/?replay");

// Straight after launch, Chrome's GPU process may still be starting Vulkan, and has no adapter yet.
let gpu;
for (let i = 0; i < 20 && !gpu; i++) {
  gpu = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    return a ? `${a.info.vendor} ${a.info.architecture} ${a.info.description}`.trim() : undefined;
  });
  if (!gpu) await new Promise((r) => setTimeout(r, 500));
}
if (!gpu || /swiftshader/i.test(gpu)) fail(`No hardware WebGPU adapter in this Chrome (${gpu ?? "none"}).`);
console.log(`WebGPU: ${gpu}`);
console.log("Loading the models (the first run downloads about 3 GB)…");
let t = Date.now();
await page.evaluate(() => window.eavesbardReplay.prepare());
console.log(`  ready after ${((Date.now() - t) / 1000).toFixed(0)} s`);

const now = () => page.evaluate(() => Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Waits for a running scene check to finish. */
async function settle() {
  while (await page.evaluate(() => window.eavesbardReplay.state().checking)) await sleep(20);
}
/** Moves the page's clock to `target`, firing timers due on the way, then lets any check finish. */
async function advanceTo(target) {
  // In steps of under 15 s, so the director's interval fires at each boundary.
  for (;;) {
    const delta = target - (await now());
    if (delta <= 0) break;
    await page.clock.fastForward(Math.min(delta, 14_000));
    await settle();
  }
  await settle();
}

const results = { name: args.name, gpu, episodes: {} };
for (const ep of episodes) {
  const stretches = labels[ep];
  const lines = await captions(ep);
  const startOffset = sec(stretches[0].from);
  const first = stretches[0];
  t = Date.now();
  await page.evaluate(() => window.eavesbardReplay.start());
  await page.evaluate(([s, i]) => window.eavesbardReplay.setScene(s, i), [first.setting[0], first.intensity[0]]);
  const t0 = await now();
  const fake = (offset) => t0 + (offset - startOffset) * 1000;
  // Each line arrives when its speech would have finished, stamped with its start.
  const arrivals = lines
    .map((c) => ({ ...c, arrive: Math.max(c.start + c.duration, startOffset) }))
    .filter((c) => c.start + c.duration >= startOffset)
    .sort((a, b) => a.arrive - b.arrive);
  let shown = 0;
  for (const [i, c] of arrivals.entries()) {
    await advanceTo(fake(c.arrive));
    await page.evaluate(([text, at, d]) => window.eavesbardReplay.line(text, at, d), [c.text, fake(c.start), c.duration]);
    if (i - shown >= 200) {
      shown = i;
      const s = await page.evaluate(() => window.eavesbardReplay.state());
      console.log(`  episode ${ep}: ${i}/${arrivals.length} lines, ${s.setting}, ${s.intensity}`);
    }
  }
  const end = arrivals.at(-1).arrive + 20;
  await advanceTo(fake(end));
  const entries = await page.evaluate(() => window.eavesbardReplay.timeline(0));
  await page.evaluate(() => window.eavesbardReplay.stop());

  // Keep what the app decided, with times in seconds into the episode; no transcript text.
  const offset = (at) => Math.round(((at - t0) / 1000 + startOffset) * 10) / 10;
  const kept = [];
  let speech = 0;
  for (const { at, event: e } of entries) {
    if (e.kind === "speech") speech++;
    else if (e.kind === "call") kept.push({ t: offset(at), kind: "call", purpose: e.purpose, model: e.model, result: e.result, latencyMs: e.latencyMs && Math.round(e.latencyMs), error: e.error });
    else if (e.kind === "decision") kept.push({ t: offset(at), kind: "decision", changed: e.changed, from: e.from, to: e.to, notes: e.notes });
    // A local pick's reason quotes its search query, which holds transcript text.
    else if (e.kind === "music" || e.kind === "error" || e.kind === "session") kept.push({ t: offset(at), kind: e.kind, text: e.text.replace(/ to “[^”]*”/g, "") });
  }
  const calls = kept.filter((k) => k.kind === "call" && k.purpose === "scene");
  const withLlm = calls.filter((k) => k.model?.includes("+")).length;
  const errors = calls.filter((k) => k.error).length;
  const ms = calls.filter((k) => k.latencyMs).map((k) => k.latencyMs);
  console.log(
    `episode ${ep}: ${speech} lines, ${calls.length} scene checks (${withLlm} with the LLM, ${errors} failed), ` +
      `${ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : "–"} ms per check, ${((Date.now() - t) / 60_000).toFixed(1)} min`,
  );
  results.episodes[ep] = { startOffset, end, speech, events: kept };
}

finished = true;
mkdirSync(join(here, "results"), { recursive: true });
const out = join(here, "results", `${args.name}.json`);
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`Saved ${out}`);
await context.close();
server.close();

// Replays real play through the real app (//src:site) in headless Chrome on
// this computer's GPU (experiments/E13.md): Bardo's "Call of the Wild" episodes
// (YouTube captions with times), or Critical Role episodes from CRD3 (clean
// transcripts, timed by word count, crd3.mjs). The page runs with ?replay
// (src/replay.ts): instead of the microphone, each line is handed to the
// listener when its speech would have finished, and everything after that is
// the app's own code: the director's 15-second scene checks, the embeddings and
// the scene LLM, the state machine and the track picks.
//
// The page's clock is Playwright's: time flows as usual, so the models and
// workers behave normally, but between lines the clock jumps ahead to the next
// line's time, firing the director's timer on the way; each scene check
// finishes before the replay moves on. Tracks are served as silence, so
// nothing is fetched from Tabletop Audio.
//
// Episodes run side by side (--parallel, 3 by default): each in its own
// Chrome, with its own copy of the models, so they share only the GPU. Each
// episode gets a fresh page, so what one episode decides can't depend on
// which episodes that Chrome ran before it. The Chromes' profiles are cheap
// copies (on btrfs) of the evaluation profile, which holds the models.
//
// The transcripts are downloaded at run time into .data/ (not committed: the
// words are the shows'). Results keep no transcript text: results/<name>.json.
//   bazel run //experiments/e13:replay -- --name run1 [--set bardo|crd3] [--episodes 1,2] [--parallel 3] [--headed]
// A new model: first --prefetch (downloads it into the evaluation profile, which runs copy).
// Then score it: bazel run //experiments/e13:score -- experiments/e13/results/run1.json
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";
import { built, chrome, source } from "../paths.mjs";
import { crd3Lines, fetchCrd3 } from "./crd3.mjs";

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    set: { type: "string", default: "bardo" },
    episodes: { type: "string" },
    headed: { type: "boolean", default: false },
    parallel: { type: "string", default: "3" },
    prefetch: { type: "boolean", default: false },
    nano: { type: "boolean", default: false },
    // The models are cached per origin: another port starts without them.
    port: { type: "string", default: "8765" },
    "max-minutes": { type: "string", default: "240" },
  },
});
if (!(args.name || args.prefetch) || !["bardo", "crd3"].includes(args.set)) {
  console.error("Give the run a --name, and --set bardo or crd3.");
  process.exit(2);
}
const here = source("experiments/e13");
const labels = JSON.parse(readFileSync(join(here, args.set === "crd3" ? "labels-crd3.json" : "labels.json"), "utf8")).episodes;
const episodes = args.episodes ? args.episodes.split(",").map((s) => s.trim()) : Object.keys(labels);

const sec = (mss) => {
  const [m, s] = mss.split(":");
  return Number(m) * 60 + Number(s);
};

/** An episode's lines: start and duration in seconds, and the text. */
async function captions(ep) {
  if (args.set === "crd3") {
    const dir = join(here, ".data", "crd3");
    fetchCrd3(dir);
    return crd3Lines(dir, ep);
  }
  return bardoCaptions(ep);
}

// --- Bardo's captions, from its repository (lucasnfe/bardo-composer, MIT). ---

const CAPTIONS = "https://raw.githubusercontent.com/lucasnfe/bardo-composer/master/data/dnd";

async function bardoCaptions(ep) {
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
}).listen(Number(args.port));

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

const contexts = [];
const fail = async (why) => {
  console.error(why);
  finished = true;
  // Close the Chromes first, or they live on holding GPU memory.
  await Promise.race([Promise.allSettled(contexts.map((c) => c.close())), new Promise((r) => setTimeout(r, 10_000))]);
  process.exit(1);
};
setTimeout(() => fail(`gave up after ${args["max-minutes"]} minutes`), Number(args["max-minutes"]) * 60_000).unref();
let finished = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profiles = join(here, ".data", "chrome", args.name ?? "prefetch");

/** A Chrome of its own, on a fresh copy of the evaluation profile (which holds the models). */
async function launch(n) {
  // realpath: in a worktree the evaluation profile may be a link to the main checkout's.
  const evaluation = realpathSync(source("experiments/e9/.chrome-profile"));
  let profile = evaluation;
  if (n !== "prefetch") {
    profile = join(profiles, String(n));
    rmSync(profile, { recursive: true, force: true });
    mkdirSync(profiles, { recursive: true });
    execFileSync("cp", ["-a", "--reflink=auto", evaluation, profile]);
    for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) rmSync(join(profile, lock), { force: true });
  }
  const context = await chromium.launchPersistentContext(profile, {
    ...chrome,
    headless: !args.headed,
    // --nano: Chrome's built-in Gemini Nano, which Playwright's defaults turn off (component updates).
    ...(args.nano ? { ignoreDefaultArgs: ["--disable-component-update", "--disable-background-networking"] } : {}),
    // WebGPU in headless Chrome on Linux needs Vulkan, here through ANGLE; without
    // these flags it falls back to SwiftShader, a CPU renderer.
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-webgpu",
      "--ignore-gpu-blocklist",
      "--use-angle=vulkan",
      args.nano ? "--enable-features=Vulkan,OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano" : "--enable-features=Vulkan",
      "--disable-vulkan-surface",
    ],
  });
  contexts.push(context);
  context.on("close", () => finished || context.done || fail(`Chrome ${n} closed`));
  await context.route("https://sounds.tabletopaudio.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: quiet }),
  );
  await context.addInitScript(() => {
    localStorage.setItem("eavesbard.engine", "local");
    localStorage.setItem("eavesbard.auto", "on");
    localStorage.setItem("eavesbard.compare", "off");
    localStorage.setItem("eavesbard.openingDescription", "");
  });
  await context.clock.install();
  // The persistent context opens with a blank page; each episode gets its own.
  for (const p of context.pages()) await p.close();
  return context;
}

/** A fresh page of the app, with its models loaded. */
async function openApp(context, log) {
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  page.on("pageerror", (e) => log(`page error: ${e.message}`));
  page.on("crash", () => fail("a page crashed"));
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && log(`console ${m.type()}: ${m.text().slice(0, 400)}`));
  page.on("worker", (w) => w.on("console", (m) => ["error", "warning"].includes(m.type()) && log(`worker ${m.type()}: ${m.text().slice(0, 400)}`)));
  await page.goto(`http://localhost:${args.port}/?replay`);
  // Straight after launch, Chrome's GPU process may still be starting Vulkan, and has no adapter yet.
  let gpu;
  for (let i = 0; i < 20 && !gpu; i++) {
    gpu = await page.evaluate(async () => {
      const a = await navigator.gpu?.requestAdapter();
      return a ? `${a.info.vendor} ${a.info.architecture} ${a.info.description}`.trim() : undefined;
    });
    if (!gpu) await sleep(500);
  }
  if (!gpu || /swiftshader/i.test(gpu)) await fail(`No hardware WebGPU adapter in this Chrome (${gpu ?? "none"}).`);
  const t = Date.now();
  await page.evaluate(() => window.eavesbardReplay.prepare());
  log(`WebGPU: ${gpu}; models ready after ${((Date.now() - t) / 1000).toFixed(0)} s`);
  return { page, gpu };
}

/** Replays one episode on a fresh page, and returns what the app decided. */
async function replay(context, ep, log) {
  const { page, gpu } = await openApp(context, log);
  const now = () => page.evaluate(() => Date.now());
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

  const stretches = labels[ep];
  const lines = await captions(ep);
  // Start at the first stretch that's scored (after any pre-show), from its scene.
  const first = stretches.find((s) => !s.skip);
  const startOffset = sec(first.from);
  const t = Date.now();
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
    // A run where the scene model stopped answering (or anything else failed) tests nothing: stop it.
    if (i % 50 === 0) {
      const error = await page.evaluate(() => window.eavesbardReplay.timeline(0).find((e) => e.event.kind === "error")?.event.text);
      if (error) await fail(`episode ${ep}: ${error}`);
    }
    if (i - shown >= 200) {
      shown = i;
      const s = await page.evaluate(() => window.eavesbardReplay.state());
      log(`${i}/${arrivals.length} lines, ${s.setting}, ${s.intensity}`);
    }
  }
  const end = arrivals.at(-1).arrive + 20;
  await advanceTo(fake(end));
  const entries = await page.evaluate(() => window.eavesbardReplay.timeline(0));
  const details = await page.evaluate(() => window.eavesbardReplay.details(0));
  await page.evaluate(() => window.eavesbardReplay.stop());
  await page.close();

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
  log(
    `done: ${speech} lines, ${calls.length} scene checks (${withLlm} with the LLM, ${errors} failed), ` +
      `${ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : "–"} ms per check, ${((Date.now() - t) / 60_000).toFixed(1)} min`,
  );
  return {
    gpu,
    result: { startOffset, end, speech, events: kept },
    // Each local check's raw scores, for offline blends (sim.mjs): large, kept apart from the results.
    details: details.map((d) => ({ ...d, t: offset(d.at) })),
  };
}

// --prefetch: download a new model into the evaluation profile itself, once, for later runs to copy.
if (args.prefetch) {
  const context = await launch("prefetch");
  const { page } = await openApp(context, (s) => console.log(s));
  await page.close();
  context.done = true;
  await context.close();
  server.close();
  process.exit(0);
}

// The longest episodes first, so no Chrome is left with a long one at the end.
const lengths = Object.fromEntries(await Promise.all(episodes.map(async (ep) => [ep, (await captions(ep)).at(-1).start])));
const queue = [...episodes].sort((a, b) => lengths[b] - lengths[a]);
const parallel = Math.max(1, Math.min(Number(args.parallel), episodes.length));
const done = {};
const started = Date.now();
console.log(`${episodes.length} episodes, ${parallel} at a time`);
await Promise.all(
  Array.from({ length: parallel }, async (_, n) => {
    const context = await launch(n);
    for (let ep; (ep = queue.shift()) !== undefined; ) {
      done[ep] = await replay(context, ep, (s) => console.log(`[${n}] episode ${ep}: ${s}`));
    }
    context.done = true;
    await context.close();
  }),
);
finished = true;

// In the order asked for, whichever Chrome ran them.
const results = { name: args.name, set: args.set, gpu: done[episodes[0]].gpu, parallel, episodes: {} };
const allDetails = {};
for (const ep of episodes) {
  results.episodes[ep] = done[ep].result;
  allDetails[ep] = done[ep].details;
}
mkdirSync(join(here, "results"), { recursive: true });
const out = join(here, "results", `${args.name}.json`);
writeFileSync(out, JSON.stringify(results, null, 1));
writeFileSync(out.replace(/\.json$/, ".details.json"), JSON.stringify(allDetails));
console.log(`Saved ${out} after ${((Date.now() - started) / 60_000).toFixed(1)} min`);
server.close();
rmSync(profiles, { recursive: true, force: true });

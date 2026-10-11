// Why did Gemma call "Roll for initiative" calm? Asks the app's exact
// questions about the moments in a real session log, scores them as the app
// does, then has the model explain itself in writing.
//   bazel run //experiments/e9:explain   (REPO=<model> CASE=calm to vary it)
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { built, source } from "../paths.mjs";

const here = source("experiments/e9");
const site = built("src/eval_site");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".map": "application/json" };
const server = createServer((req, res) => {
  const path = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(site) || !existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
}).listen(8765); // A fixed port: Chrome caches models per origin.

const context = await chromium.launchPersistentContext(join(here, ".chrome-profile"), { channel: "chrome", headless: true });
const watchdog = setTimeout(() => {
  console.error("gave up after 10 minutes");
  process.exit(1);
}, 10 * 60_000);
const page = await context.newPage();
page.setDefaultTimeout(5 * 60_000);
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("http://localhost:8765/llm-eval.html");
await page.evaluate((repo) => window.evalLoad({ repo }), process.env.REPO ?? "onnx-community/gemma-4-E2B-it-ONNX");

const cases = process.env.CASE === "calm" ? {
  "card game at the inn": { lines: ["there's a card game going on at the corner table", "can i join in i want to play a few hands", "sure it's three card dragon, the dwarf dealing looks pretty drunk", "i'm gonna use sleight of hand to cheat. no don't do that we need these people"], current: { setting: "tavern", intensity: "calm" } },
} : {
  "first check": { lines: ["Roll for initiative"], current: { setting: "tavern", intensity: "calm" } },
  "second check": { lines: ["Roll for initiative", "Role for initiative", "Let's fight"], current: { setting: "tavern", intensity: "calm" } },
  "first check, had the scene been tense": { lines: ["Roll for initiative"], current: { setting: "tavern", intensity: "tense" } },
};
const extras = [
  "First explain your reasoning in one or two sentences. Then give the answer on its own line as \"Answer: <word>\".",
  "Answer with one word from the list, then explain your choice in one sentence.",
];
for (const [name, input] of Object.entries(cases)) {
  const results = await page.evaluate(([i, e]) => window.evalExplain(i, e), [input, extras]);
  for (const r of results.filter((r) => r.axis === "intensity")) {
    console.log(`\n### ${name}\n--- prompt ---\n${r.prompt}\n--- scored as the app does ---`);
    console.log(Object.entries(r.scored).map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`).join(", "));
    for (const w of r.written) console.log(`--- asked: ${w.instruction}\n${w.text.trim()}`);
  }
}
clearTimeout(watchdog);
await Promise.race([context.close(), new Promise((r) => setTimeout(r, 10_000))]);
server.close();
process.exit(0);

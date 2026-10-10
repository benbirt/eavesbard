// Runs the scenario sets through an LLM on this computer's GPU, in headless
// Chrome, via the evaluation page (src/eval/llm-eval.ts). Saves raw answers
// to results/<name>.json for analyse.mjs.
//   bazel build //src:eval_site
//   node browser-eval.mjs --repo onnx-community/gemma-3-4b-it-ONNX --variants current,json-names --name gemma3
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    repo: { type: "string" },
    dtype: { type: "string" },
    tokenizer: { type: "string" },
    "empty-thought": { type: "boolean", default: false },
    variants: { type: "string", default: "current" },
    free: { type: "string", default: "0" },
    sets: { type: "string", default: "dev,test" },
    name: { type: "string" },
    headed: { type: "boolean", default: false },
  },
});
const here = new URL(".", import.meta.url).pathname;
const site = join(here, "../../bazel-bin/src/eval_site");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".map": "application/json" };
const server = createServer((req, res) => {
  const path = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(site) || !existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
}).listen(8765); // A fixed port: Chrome caches models per origin.
const port = server.address().port;

// A persistent profile keeps downloaded models in Chrome's cache between runs.
const context = await chromium.launchPersistentContext(join(here, ".chrome-profile"), {
  channel: "chrome",
  headless: !args.headed,
});
const page = await context.newPage();
page.setDefaultTimeout(0);
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text().slice(0, 300)));
await page.goto(`http://localhost:${port}/llm-eval.html`);
let shown = 0;
const progress = setInterval(async () => {
  const lines = await page.evaluate(() => window.evalLog).catch(() => []);
  for (const l of lines.slice(shown)) console.log("  " + l);
  shown = lines.length;
}, 2000);

const started = Date.now();
await page.evaluate((m) => window.evalLoad(m), { repo: args.repo, emptyThought: args["empty-thought"], ...(args.dtype ? { dtype: args.dtype } : {}), ...(args.tokenizer ? { tokenizerRepo: args.tokenizer } : {}) });
const results = await page.evaluate((o) => window.evalRun(o), {
  variants: args.variants.split(","),
  freeText: Number(args.free),
  sets: args.sets.split(","),
});
clearInterval(progress);
mkdirSync(join(here, "results"), { recursive: true });
const out = join(here, "results", `${args.name}.json`);
writeFileSync(out, JSON.stringify({ repo: args.repo, dtype: args.dtype, variants: args.variants.split(","), results }));
const perScene = Object.fromEntries(args.variants.split(",").map((v) => [v, (results.reduce((a, r) => a + r.llm[v].ms, 0) / results.length / 1000).toFixed(2) + " s"]));
console.log(`saved ${out}: ${results.length} scenes in ${((Date.now() - started) / 1000).toFixed(0)} s; per scene:`, perScene);
await context.close();
server.close();

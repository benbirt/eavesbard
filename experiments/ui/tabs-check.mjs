// Checks that a copy of the app notices another open in the same browser
// profile: both show the notice, the second's Begin waits, and closing one
// clears the other's notice. A fresh profile, so no models load.
//   bazel run //experiments/ui:tabs_check
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { built } from "../paths.mjs";
const site = built("src/site");
const T = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  let p = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(8768);
const dir = mkdtempSync(join(tmpdir(), "eb-tabs-"));
const ctx = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: true });
const notice = (p) => p.locator(".other-tabs").count();
const a = await ctx.newPage();
await a.goto("http://localhost:8768/");
await a.waitForTimeout(1500);
const expect = (ok, what) => { if (!ok) { console.log("FAILED:", what); process.exitCode = 1; } else console.log("ok:", what); };
expect((await notice(a)) === 0, "one tab: no notice");
const b = await ctx.newPage();
await b.goto("http://localhost:8768/");
await b.waitForTimeout(1500);
expect((await notice(a)) === 1 && (await notice(b)) === 1, "two tabs: both show the notice");
expect((await b.locator("button.begin").innerText()) === "Eavesbard is open in another tab", "the second's Begin waits");
await b.close();
await a.waitForTimeout(1500);
expect((await notice(a)) === 0, "closing the second clears the first's notice");
await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
rmSync(dir, { recursive: true, force: true });
server.close();
process.exit(process.exitCode ?? 0);

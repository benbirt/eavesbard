// Checks choosing the picture by hand: the gallery opens from the caption
// with every picture, and a pick shows at once, marked "your pick". A fresh
// profile, so no models load.
//   bazel run //experiments/ui:gallery_check
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { built, source } from "../paths.mjs";
const site = built("src/site");
const T = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  let p = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(8769);
const dir = mkdtempSync(join(tmpdir(), "eb-gallery-"));
const ctx = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: true, viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:8769/");
const out = source("experiments/ui/shots");
mkdirSync(out, { recursive: true });
const expect = (ok, what) => { if (!ok) { console.log("FAILED:", what); process.exitCode = 1; } else console.log("ok:", what); };
await page.getByRole("button", { name: "Choose picture" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, "gallery.png") });
expect((await page.locator(".thumb").count()) === 15, "the gallery shows all 15 pictures");
const pick = page.locator(".thumb").nth(10);
const title = await pick.getAttribute("title");
await pick.click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(out, "gallery-picked.png") });
expect((await page.locator(".gallery").count()) === 0, "picking closes the gallery");
expect((await page.locator(".frame .img").getAttribute("alt")) === title, "the picked picture shows");
expect((await page.locator(".credit").innerText()).includes("your pick"), "the caption says it's your pick");
await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
rmSync(dir, { recursive: true, force: true });
server.close();
process.exit(process.exitCode ?? 0);

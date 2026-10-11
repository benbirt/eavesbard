// Checks model downloads in a fresh browser profile: Download now starts
// them, Pause stops all fetching, Resume carries on, and after a reload the
// saved pieces are reused rather than fetched again. Uses Whisper small
// (about 590 MB) with automatic music off, so only it downloads.
//   bazel run //experiments/ui:download_check
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { built } from "../paths.mjs";
const site = built("src/site");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  let path = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
}).listen(8766);
const profile = mkdtempSync(join(tmpdir(), "eavesbard-pause-"));
const context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: true });
const finish = async (code) => { await Promise.race([context.close(), new Promise((r) => setTimeout(r, 5000))]); rmSync(profile, { recursive: true, force: true }); server.close(); process.exit(code); };
setTimeout(() => { console.log("TIMED OUT"); void finish(1); }, 9 * 60_000).unref();
const page = await context.newPage();
page.setDefaultTimeout(60_000);
page.on("pageerror", (e) => console.log("page error:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 200)));
let bytes = 0;
context.on("response", (r) => { if (r.status() === 206) bytes += Number(r.headers()["content-length"] ?? 0); });
await page.addInitScript(() => { localStorage.setItem("eavesbard.auto", "off"); localStorage.setItem("eavesbard.whisperModel", "small.en"); });
const chip = () => page.locator(".chip").first().innerText().then((t) => t.replace(/\s+/g, " ")).catch(() => "?");
const mb = () => `${(bytes / 1e6).toFixed(0)} MB fetched`;
try {
  await page.goto("http://localhost:8766/");
  await page.getByRole("button", { name: /^Download now/ }).click();
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); console.log(`t+${(i + 1) / 2}s`, await chip(), "|", mb()); }
  await page.getByRole("button", { name: /Pause downloads/ }).click();
  await page.waitForTimeout(1500);
  const atPause = bytes;
  await page.waitForTimeout(5000);
  console.log("paused 5 s:", await chip(), `| fetched while paused: ${((bytes - atPause) / 1e6).toFixed(1)} MB`);
  await page.getByRole("button", { name: /Resume downloads/ }).click();
  await page.waitForTimeout(3000);
  console.log("resumed 3 s:", await chip(), "|", mb());
  const before = bytes;
  await page.reload();
  await page.getByRole("button", { name: /^Download now/ }).click();
  await page.waitForTimeout(2000);
  console.log("after reload + Download:", await chip(), `| fetched since reload: ${((bytes - before) / 1e6).toFixed(0)} MB`);
  await page.locator(".chip", { hasText: "Whisper small ready" }).waitFor({ timeout: 400_000 });
  console.log("finished:", await chip(), "|", mb());
  await finish(0);
} catch (err) {
  console.log("FAILED:", err.message.split("\n")[0], "| chip:", await chip());
  await finish(1);
}

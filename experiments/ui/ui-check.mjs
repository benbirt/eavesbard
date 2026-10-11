// Drives the real app (bazel-bin/src/site) in headless Chrome on this
// computer's GPU, through its main states, saving screenshots. Every step
// has a 30 s limit, and the whole run a 6-minute limit.
//   bazel build //src:site && node ui-check.mjs <screenshot-dir>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const { chromium } = createRequire(new URL("../e9/", import.meta.url).pathname)("playwright-core");
const repo = new URL("../..", import.meta.url).pathname;
const site = join(repo, "bazel-bin/src/site");
const out = process.argv[2] ?? join(repo, "experiments/ui/shots");
mkdirSync(out, { recursive: true });
const T = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".webp": "image/webp", ".woff2": "font/woff2" };
// Port 8765, the evaluation runs' origin: their Chrome profile already has the models cached.
const server = createServer((req, res) => {
  let p = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(site) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(8765);

const ctx = await chromium.launchPersistentContext(join(repo, "experiments/e9/.chrome-profile"), {
  channel: "chrome", headless: true, permissions: ["microphone"], viewport: { width: 1360, height: 860 },
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const page = await ctx.newPage();
page.setDefaultTimeout(30_000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let stepName = "start";
const finish = async (code, why) => {
  if (why) console.log(`FAILED at "${stepName}": ${why}`);
  await page.screenshot({ path: join(out, "last.png") }).catch(() => undefined);
  console.log("page errors:", errors.length ? errors : "none");
  await ctx.close().catch(() => undefined);
  server.close();
  process.exit(code);
};
const watchdog = setTimeout(() => void finish(1, "the whole run took over 6 minutes"), 6 * 60_000);
const step = async (name, fn) => {
  stepName = name;
  await fn();
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log("ok:", name);
};

try {
  await page.addInitScript(() => {
    localStorage.setItem("eavesbard.engine", "local");
    localStorage.setItem("eavesbard.auto", "on");
    localStorage.setItem("eavesbard.whisperModel", "tiny.en");
  });
  await step("1-before", async () => {
    await page.goto("http://localhost:8765/");
    await page.getByRole("button", { name: "Begin session" }).waitFor();
    await page.locator(".chip.model.ok").waitFor({ timeout: 120_000 }); // Gemma loaded from cache
  });
  await step("2-session", async () => {
    await page.getByLabel("Opening scene").fill("sailing to the islands on a merchant ship");
    await page.getByRole("button", { name: "Begin session" }).click();
    await page.locator(".track").waitFor({ timeout: 60_000 });
  });
  await step("3-combat", async () => {
    await page.locator('.pills[aria-label="Intensity"] .pill', { hasText: "Combat" }).click();
    await page.locator(".badge", { hasText: "Combat" }).waitFor();
    await page.waitForTimeout(3000);
  });
  await step("3b-seek", async () => {
    const seek = page.getByLabel("Position in track");
    await seek.waitFor({ timeout: 30_000 }); // once the track's length is known
    const box = await seek.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => {
      const input = document.querySelector('input[aria-label="Position in track"]');
      return input && Math.abs(Number(input.value) / Number(input.max) - 0.5) < 0.05;
    });
  });
  await step("4-log", async () => {
    await page.getByRole("button", { name: "Log" }).click();
    await page.locator(".drawer.open .log").waitFor();
    await page.waitForTimeout(500); // the panel slides in
  });
  await step("5-setup-tab", async () => {
    await page.locator(".drawer.open .tab", { hasText: "Setup" }).click();
    await page.locator(".drawer.open h3", { hasText: "Who decides the scene" }).waitFor();
    await page.waitForTimeout(500);
  });
  await step("6-closed", async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".drawer.open"));
  });
  await step("6b-click-outside", async () => {
    await page.getByRole("button", { name: "Log" }).click();
    await page.locator(".drawer.open .log").waitFor();
    await page.mouse.click(40, 300);
    await page.waitForFunction(() => !document.querySelector(".drawer.open"));
    await page.locator(".track").waitFor(); // the click closed the panel and did nothing else
  });
  await step("6c-footer", async () => {
    await page.locator(".foot").scrollIntoViewIfNeeded();
  });
  await step("6d-credits", async () => {
    await page.locator(".foot summary", { hasText: "credits" }).click();
    await page.locator(".foot .credits li").first().waitFor();
  });
  await step("7-phone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
  });
  await step("7b-manual", async () => {
    await page.setViewportSize({ width: 1360, height: 860 });
    await page.getByRole("button", { name: "Setup" }).click();
    await page.getByRole("checkbox").first().uncheck();
    await page.keyboard.press("Escape");
    await page.locator(".card.picker").waitFor();
    await page.waitForTimeout(500);
  });
  await step("8-reset", async () => {
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.evaluate(() => localStorage.setItem("eavesbard.anthropicApiKey", "sk-test"));
    await page.getByRole("button", { name: "Setup" }).click();
    await page.getByRole("button", { name: "Reset to defaults…" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, "8-reset-confirm.png") });
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Yes, reset" }).click()]);
    const key = await page.evaluate(() => localStorage.getItem("eavesbard.anthropicApiKey"));
    if (key !== null) throw new Error("the API key survived the reset");
  });
  stepName = "listening";
  const chip = await page.locator(".chip").first().innerText();
  console.log("listening chip after the run:", chip.replace(/\s+/g, " "));
  clearTimeout(watchdog);
  await finish(0);
} catch (err) {
  clearTimeout(watchdog);
  await finish(1, err instanceof Error ? err.message.split("\n")[0] : String(err));
}

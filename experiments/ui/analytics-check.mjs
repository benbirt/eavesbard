// Checks usage analytics (src/analytics.ts) against the built site, with
// eavesbard.com pointed at a local server and PostHog's requests answered
// here, so nothing reaches PostHog: a visit sends a page view and nothing is
// stored in the browser; a session with a track sends session_started,
// track_started and session_ended (with the track counted), carrying no
// transcript, scene or description; leaving the page mid-session sends a
// beacon to PostHog (session_ended); and localhost, the Setup opt-out, Do
// Not Track, automation and replays each send nothing (PostHog's bundle
// isn't even loaded).
// A fresh profile, with automatic music off, so no models load.
//   bazel run //experiments/ui:analytics_check
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { built, chrome } from "../paths.mjs";

const PORT = 8767;
const site = built("src/site");
const T = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  let p = join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(PORT);

// PostHog drops events from user agents that look like bots, as headless Chrome's does,
// so the pages present this Chrome's ordinary user agent.
const userAgent = await (async () => {
  const browser = await chromium.launch({ ...chrome, headless: true });
  const agent = await (await browser.newPage()).evaluate(() => navigator.userAgent);
  await browser.close();
  return agent.replace("HeadlessChrome", "Chrome");
})();

let failures = 0;
const expect = (ok, what) => {
  console.log(ok ? "ok:" : "FAILED:", what);
  if (!ok) failures++;
};

/** The events in one PostHog request body, whatever encoding the SDK chose. */
function decode(body) {
  if (!body) return [];
  let text;
  // Gzipped (the SDK's default), whether or not the URL says so.
  if (body[0] === 0x1f && body[1] === 0x8b) text = gunzipSync(body).toString("utf8");
  else {
    text = body.toString("utf8");
    if (text.startsWith("data=")) text = Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString("utf8");
  }
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : (parsed.batch ?? [parsed]);
}

/**
 * Opens a fresh profile. `site` is eavesbard.com unless overridden; Chrome's
 * automation flag is hidden unless `automation`, so the page sees an ordinary
 * visit. Returns the context, the PostHog events and every other host asked.
 */
async function open({ automation = false, extraArgs = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eb-analytics-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    ...chrome,
    headless: true,
    userAgent,
    args: [
      // eavesbard.com is the local server. PostHog resolves nowhere, so a request the routes below
      // miss (a beacon sent as a page unloads, say) fails rather than reaching the real project.
      `--host-resolver-rules=MAP eavesbard.com 127.0.0.1, MAP *.posthog.com ~NOTFOUND`,
      ...(automation ? [] : ["--disable-blink-features=AutomationControlled"]),
      ...extraArgs,
    ],
  });
  if (process.env.DEBUG) ctx.on("page", (p) => p.on("console", (m) => console.log("   console:", m.type(), m.text().slice(0, 300))));
  const events = [];
  const hosts = new Set();
  const bundles = [];
  await ctx.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("analytics-posthog.js")) bundles.push(url.pathname);
    if (url.hostname === "eavesbard.com" || url.hostname === "localhost") return route.continue();
    hosts.add(url.hostname);
    if (url.hostname.endsWith("posthog.com")) {
      try {
        events.push(...decode(request.postDataBuffer()));
      } catch (err) {
        events.push({ event: "UNDECODABLE", error: String(err) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1}' });
    }
    // The audio host and model downloads: answer nothing, so no traffic leaves.
    return route.fulfill({ status: 404, body: "" });
  });
  const close = async () => {
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
    rmSync(dir, { recursive: true, force: true });
  };
  return { ctx, events, hosts, bundles, close };
}

const settle = (page, ms = 2500) => page.waitForTimeout(ms);
/** Waits until `events` includes every one of `wanted` (PostHog batches its sends), or 15 s. */
async function arrived(events, ...wanted) {
  for (let waited = 0; waited < 15_000; waited += 250) {
    if (wanted.every((name) => events.some((e) => e.event === name))) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}
const names = (events) => events.map((e) => e.event);
const props = (events, name) => events.find((e) => e.event === name)?.properties ?? {};

// 1. An ordinary visit, then a session with one track, stopped; then one left running as the page closes.
{
  const { ctx, events, hosts, bundles, close } = await open();
  const page = await ctx.newPage();
  await page.goto(`http://eavesbard.com:${PORT}/`);
  await arrived(events, "$pageview");
  expect(await page.evaluate(() => navigator.webdriver === false), "the page sees an ordinary (non-automated) browser");
  expect(names(events).join() === "$pageview", `a visit sends one page view (got: ${names(events).join() || "nothing"})`);
  expect(!events.some((e) => e.event === "UNDECODABLE"), "every PostHog request decodes");
  const storage = await page.evaluate(() => ({
    cookies: document.cookie,
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect((await ctx.cookies()).length === 0 && storage.cookies === "", "no cookies");
  expect(!storage.local.some((k) => !k.startsWith("eavesbard.")) && storage.session.length === 0, `nothing of PostHog's in local or session storage (local: ${storage.local.join(", ") || "none"}; session: ${storage.session.join(", ") || "none"})`);
  expect(bundles.length === 1, "PostHog's bundle loads once");

  // Automatic music off: Begin needs no models, and tracks are picked by hand.
  await page.evaluate(() => localStorage.setItem("eavesbard.auto", "off"));
  await page.evaluate(() => localStorage.setItem("eavesbard.openingDescription", "SECRET-DESCRIPTION in a tavern"));
  await page.reload();
  await settle(page);
  events.length = 0;
  await page.locator("button.begin").click();
  await settle(page, 1000);
  await page.locator(".picker button.btn").first().click();
  await settle(page, 1500);
  await page.locator("button.stop").click();
  await arrived(events, "session_started", "track_started", "session_ended");
  const sent = names(events);
  expect(["session_started", "track_started", "session_ended"].every((n) => sent.includes(n)), `a session sends its start, its track and its end (got: ${sent.join(", ")})`);
  const started = props(events, "session_started");
  expect(started.automatic === false && started.output === "local" && typeof started.speech_model === "string" && typeof started.scene_engine === "string", `session_started says how it was set up (${JSON.stringify({ automatic: started.automatic, scene_engine: started.scene_engine, speech_model: started.speech_model, output: started.output })})`);
  const track = props(events, "track_started");
  expect(track.source === "tabletopaudio" && track.output === "local", `track_started names its host (${track.source}, ${track.output})`);
  const ended = props(events, "session_ended");
  expect(ended.tracks === 1 && ended.minutes === 0 && ended.ended_by === "stop", `session_ended counts the track (${JSON.stringify({ tracks: ended.tracks, minutes: ended.minutes, ended_by: ended.ended_by })})`);
  const everything = JSON.stringify(events);
  expect(!everything.includes("SECRET-DESCRIPTION"), "the opening description is never sent");
  expect(events.every((e) => e.properties?.$process_person_profile === false), "no person profiles");
  expect([...hosts].every((h) => h === "eu.i.posthog.com" || h === "sounds.tabletopaudio.com" || h === "www.gstatic.com"), `only PostHog (EU), the audio host and the Cast SDK are asked (${[...hosts].join(", ")})`);

  if (process.env.DEBUG) console.log("   properties on session_started:", JSON.stringify(props(events, "session_started"), null, 1));

  // A session still running when the page goes away. Requests sent as a page unloads can't be
  // intercepted, so the page notes each beacon it sends in localStorage, read back afterwards.
  await page.evaluate(() => {
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      localStorage.setItem("check.beacons", `${localStorage.getItem("check.beacons") ?? ""} ${new URL(url).host}`);
      return send(url, data);
    };
  });
  await page.locator("button.begin").click();
  await settle(page, 1000);
  await page.goto("about:blank");
  await page.goto(`http://eavesbard.com:${PORT}/`);
  const beacons = await page.evaluate(() => localStorage.getItem("check.beacons") ?? "");
  expect(beacons.includes("eu.i.posthog.com"), `leaving the page mid-session sends a beacon to PostHog (${beacons.trim() || "none"})`);
  await close();
}

// 2. Visits that mustn't be counted: nothing is sent, and PostHog's bundle never loads.
for (const [what, setup] of [
  ["localhost", { url: `http://localhost:${PORT}/` }],
  ["turned off in Setup", { url: `http://eavesbard.com:${PORT}/`, before: (p) => p.evaluate(() => localStorage.setItem("eavesbard.analytics", "off")) }],
  ["automation (navigator.webdriver)", { url: `http://eavesbard.com:${PORT}/`, automation: true }],
  ["Do Not Track", { url: `http://eavesbard.com:${PORT}/`, dnt: true }],
  ["replaying a transcript", { url: `http://eavesbard.com:${PORT}/?replay` }],
]) {
  const { ctx, events, bundles, close } = await open({ automation: setup.automation });
  const page = await ctx.newPage();
  if (setup.dnt) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" }));
  if (setup.before) {
    await page.goto(setup.url);
    await setup.before(page);
    events.length = 0;
    bundles.length = 0;
  }
  await page.goto(setup.url);
  await settle(page);
  expect(events.length === 0 && bundles.length === 0, `${what}: nothing sent, PostHog not loaded`);
  await close();
}

server.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);

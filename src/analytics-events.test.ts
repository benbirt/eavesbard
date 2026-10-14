import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENT_NAMES, mayCount, PRODUCTION_HOST, sessionMinutes, trackSource, type Environment } from "./analytics-events.js";
import { audioUrl } from "./tracks.js";

const visit: Environment = {
  hostname: PRODUCTION_HOST,
  replaying: false,
  webdriver: false,
  doNotTrack: null,
  globalPrivacyControl: undefined,
  optedOut: false,
};

test("an ordinary visit to eavesbard.com is counted", () => {
  assert.equal(mayCount(visit), true);
  // Browsers that don't say either way, or say tracking is fine, count.
  assert.equal(mayCount({ ...visit, doNotTrack: undefined, globalPrivacyControl: false }), true);
  assert.equal(mayCount({ ...visit, doNotTrack: "0" }), true);
});

test("development, experiments, forks, opted-out and do-not-track visits are not counted", () => {
  for (const hostname of ["localhost", "127.0.0.1", "benbirt.github.io", "www.eavesbard.com", "eavesbard.com.example"]) {
    assert.equal(mayCount({ ...visit, hostname }), false, hostname);
  }
  assert.equal(mayCount({ ...visit, replaying: true }), false, "replaying a transcript");
  assert.equal(mayCount({ ...visit, webdriver: true }), false, "driven by automation");
  assert.equal(mayCount({ ...visit, doNotTrack: "1" }), false, "Do Not Track");
  assert.equal(mayCount({ ...visit, globalPrivacyControl: true }), false, "Global Privacy Control");
  assert.equal(mayCount({ ...visit, optedOut: true }), false, "turned off in Setup");
});

test("tracks are attributed to their audio host", () => {
  assert.equal(trackSource(audioUrl("318_The_Gaping_Maw")), "tabletopaudio");
  assert.equal(trackSource("https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sneaky%20Snitch.mp3"), "incompetech");
  assert.equal(trackSource("https://music.example.org/a.mp3"), "music.example.org");
  assert.equal(trackSource("not a url"), "unknown");
});

test("session length is in whole minutes, never negative", () => {
  assert.equal(sessionMinutes(0, 0), 0);
  assert.equal(sessionMinutes(0, 29_999), 0);
  assert.equal(sessionMinutes(0, 30_000), 1);
  assert.equal(sessionMinutes(0, 3 * 3_600_000 + 20_000), 180);
  assert.equal(sessionMinutes(10_000, 0), 0);
});

test("event names are unique and use PostHog's own name for page views", () => {
  assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length);
  assert.ok(EVENT_NAMES.includes("$pageview"));
  for (const name of EVENT_NAMES) assert.match(name, /^(\$pageview|[a-z]+(_[a-z]+)*)$/, name);
});

test("every event PostHog's insights use is one the app sends", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = "posthog/queries";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, `no queries found in ${dir}`);
  const used = new Set<string>();
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(collect);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "event" && typeof value === "string") used.add(value);
        else collect(value);
      }
    }
  };
  for (const file of files) collect(JSON.parse(readFileSync(`${dir}/${file}`, "utf8")));
  for (const event of used) assert.ok((EVENT_NAMES as readonly string[]).includes(event), `${event} is used in ${dir} but never sent`);
});

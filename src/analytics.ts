// Usage analytics (DESIGN.md 7.11): counts visits, downloads, sessions and
// tracks played, with PostHog and without cookies, only on eavesbard.com and
// never anything said at the table. PostHog itself is a separate bundle,
// loaded only when the visit may be counted.

import { signal } from "@preact/signals";
import { type AnalyticsEvent, mayCount, sessionMinutes, trackSource } from "./analytics-events.js";
import { assetUrl } from "./assets.js";
import type { Output } from "./player.js";
import { replaying } from "./replay-flag.js";
import { loadSetting, saveSetting } from "./settings.js";

type Client = typeof import("./analytics-client.js");

/** Setting that records the user's choice in Setup; kept by Reset to defaults. */
export const ANALYTICS_SETTING = "analytics";

/** Whether usage counts are on, as chosen in Setup (on unless turned off). */
export const countingOn = signal(loadSetting(ANALYTICS_SETTING) !== "off");

function allowed(): boolean {
  if (typeof location === "undefined" || typeof navigator === "undefined") return false;
  return mayCount({
    hostname: location.hostname,
    replaying,
    webdriver: navigator.webdriver,
    doNotTrack: navigator.doNotTrack,
    globalPrivacyControl: (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl,
    optedOut: !countingOn.value,
  });
}

let client: Client | undefined;
let loading: Promise<Client | undefined> | undefined;
/** Events sent before the client has loaded. */
const queue: AnalyticsEvent[] = [];

function load(): Promise<Client | undefined> {
  loading ??= import(assetUrl("analytics-posthog.js"))
    .then((loaded: Client) => {
      loaded.start();
      client = loaded;
      for (const event of queue.splice(0)) if (allowed()) client.capture(event);
      return client;
    })
    .catch(() => undefined); // Blocked (e.g. by an ad blocker) or offline: count nothing.
  return loading;
}

/** Sends an event, if this visit may be counted. */
function send(event: AnalyticsEvent, closing = false): void {
  if (!allowed()) return;
  if (client) client.capture(event, closing);
  else {
    queue.push(event);
    void load();
  }
}

/** Turns usage counts on or off (Setup), remembering the choice. */
export function setCounting(on: boolean): void {
  countingOn.value = on;
  saveSetting(ANALYTICS_SETTING, on ? "on" : "off");
  if (!on) queue.length = 0;
}

// The session being counted: when it started and how many tracks it played.
let session: { startedAt: number; tracks: number } | undefined;

export function countSessionStarted(details: Omit<Extract<AnalyticsEvent, { name: "session_started" }>, "name">): void {
  session = { startedAt: Date.now(), tracks: 0 };
  send({ name: "session_started", ...details });
}

export function countSessionEnded(endedBy: "stop" | "page_closed"): void {
  if (!session) return;
  const { startedAt, tracks } = session;
  session = undefined;
  send({ name: "session_ended", minutes: sessionMinutes(startedAt, Date.now()), tracks, ended_by: endedBy }, endedBy === "page_closed");
}

export function countTrackStarted(url: string, output: Output): void {
  if (session) session.tracks++;
  send({ name: "track_started", source: trackSource(url), output });
}

export function countDownloadsAllowed(): void {
  send({ name: "downloads_allowed" });
}

export function countModelDownloaded(model: string): void {
  send({ name: "model_downloaded", model });
}

if (typeof window !== "undefined") {
  // A session still running when the page closes ends there.
  window.addEventListener("pagehide", () => countSessionEnded("page_closed"));
  // The visit itself, once the page has loaded, so PostHog never delays it.
  const pageview = () => send({ name: "$pageview" });
  if (document.readyState === "complete") pageview();
  else window.addEventListener("load", pageview, { once: true });
}

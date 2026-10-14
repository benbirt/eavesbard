// What usage analytics counts (DESIGN.md 7.11), and when it may count at all.
// Pure, so it can be tested without a browser or PostHog. The PostHog
// configuration (insights, funnels) refers to these event names.

import type { Output } from "./player.js";
import type { SpeechModel } from "./stt/protocol.js";
import type { Engine } from "./timeline.js";

/** Where a played track's audio comes from, by host; anything unknown is reported by its hostname. */
const SOURCES: Record<string, string> = {
  "sounds.tabletopaudio.com": "tabletopaudio",
  "incompetech.com": "incompetech",
};

/**
 * Every event sent, with its properties. Nothing here can carry what's said
 * at the table: no transcript, scene, opening description or key.
 */
export type AnalyticsEvent =
  /** The page opened (PostHog's own name, so its web analytics count it). */
  | { name: "$pageview" }
  /** The user chose to download models this visit. */
  | { name: "downloads_allowed" }
  /** A model finished downloading for the first time in this browser. */
  | { name: "model_downloaded"; model: string }
  | { name: "session_started"; automatic: boolean; scene_engine: Engine; speech_model: SpeechModel; output: Output }
  /** `ended_by`: Stop, or the page closing mid-session. */
  | { name: "session_ended"; minutes: number; tracks: number; ended_by: "stop" | "page_closed" }
  /** A track was asked for: what the audio hosts see, one request per track. */
  | { name: "track_started"; source: string; output: Output };

export type EventName = AnalyticsEvent["name"];

// A record, so the compiler insists on every event's name being listed.
const NAMES: Record<EventName, true> = {
  $pageview: true,
  downloads_allowed: true,
  model_downloaded: true,
  session_started: true,
  session_ended: true,
  track_started: true,
};

/** Every event name, for checking the PostHog configuration against. */
export const EVENT_NAMES = Object.keys(NAMES) as readonly EventName[];

/** The only site whose visits are counted: not development, experiments, or forks. */
export const PRODUCTION_HOST = "eavesbard.com";

export interface Environment {
  hostname: string;
  /** Replaying a recorded transcript (?replay), for experiments. */
  replaying: boolean;
  /** Driven by automation, such as Playwright in the experiments. */
  webdriver: boolean;
  /** navigator.doNotTrack, or undefined if the browser doesn't say. */
  doNotTrack: string | null | undefined;
  /** navigator.globalPrivacyControl (Global Privacy Control). */
  globalPrivacyControl: boolean | undefined;
  /** The user turned usage counts off in Setup. */
  optedOut: boolean;
}

/** Whether this visit may be counted. */
export function mayCount(env: Environment): boolean {
  return (
    env.hostname === PRODUCTION_HOST &&
    !env.replaying &&
    !env.webdriver &&
    env.doNotTrack !== "1" &&
    env.globalPrivacyControl !== true &&
    !env.optedOut
  );
}

/** Which audio host a track's URL is on, as a short name. */
export function trackSource(url: string): string {
  try {
    const host = new URL(url).hostname;
    return SOURCES[host] ?? host;
  } catch {
    return "unknown";
  }
}

/** A session's length in whole minutes, for session_ended. */
export function sessionMinutes(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round((endedAt - startedAt) / 60_000));
}

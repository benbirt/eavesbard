// Playback state and actions, shared by the UI. State lives in signals so
// components update when playback or Cast events change it.

import { signal } from "@preact/signals";
import type { PlaybackAdapter, PlaybackEvent } from "./playback/adapter.js";
import { CastAdapter, loadCastSdk } from "./playback/cast.js";
import { LocalAdapter } from "./playback/local.js";
import type { LibraryTrack } from "./library/tag-map.js";
import { audioUrl } from "./tracks.js";

const FADE_MS = 4000;

/** How long to let Cast discovery run before suggesting why it found nothing. */
const CAST_HINT_DELAY_MS = 8000;

export type Output = "local" | "cast";

export interface LogEntry {
  id: number;
  time: Date;
  source: Output;
  event: PlaybackEvent;
}

export interface CastStatus {
  /** undefined while the SDK is loading. */
  available: boolean | undefined;
  /** The SDK's view of the network, e.g. "no Cast devices found on this network". */
  state: string;
  /** Set once discovery has found nothing for a while: what the user should check. */
  hint: string;
}

export const output = signal<Output>("local");
export const castStatus = signal<CastStatus>({ available: undefined, state: "", hint: "" });
/** Newest first. */
export const events = signal<LogEntry[]>([]);

let nextId = 0;
function log(source: Output, event: PlaybackEvent): void {
  events.value = [{ id: nextId++, time: new Date(), source, event }, ...events.value];
}

const local = new LocalAdapter();
local.onEvent((e) => log("local", e));
let cast: CastAdapter | undefined;

loadCastSdk().then((available) => {
  if (!available) {
    castStatus.value = { available: false, state: "", hint: "" };
    log("cast", { type: "info", detail: `Cast SDK unavailable; user agent: ${navigator.userAgent}` });
    return;
  }
  const adapter = new CastAdapter();
  cast = adapter;
  const loadedAt = performance.now();
  const update = () => {
    const showHint = adapter.hasNoDevices() && performance.now() - loadedAt >= CAST_HINT_DELAY_MS;
    castStatus.value = { available: true, state: adapter.castState(), hint: showHint ? noDevicesHint() : "" };
  };
  adapter.onEvent((e) => {
    log("cast", e);
    update();
  });
  setTimeout(update, CAST_HINT_DELAY_MS);
  update();
});

/**
 * Web pages can't see the operating system permissions that Cast discovery
 * needs, so when nothing is found we can only say what to check.
 */
function noDevicesHint(): string {
  const ua = navigator.userAgent;
  const where = /Android/.test(ua)
    ? "On Android, Chrome needs the Nearby devices permission: Settings → Apps → Chrome → Permissions."
    : /Macintosh/.test(ua)
      ? "On macOS, Chrome needs Local Network access: System Settings → Privacy & Security → Local Network."
      : "Check that Chrome is allowed to find devices on your local network.";
  return `No Cast devices found. ${where} Also check you're on the same Wi-Fi as the Cast device, with no VPN running.`;
}

function adapter(): PlaybackAdapter {
  if (output.value === "cast") {
    if (!cast) throw new Error("Cast isn't ready");
    return cast;
  }
  return local;
}

/** Runs an action, logging any failure instead of throwing. */
async function run(source: Output, action: () => Promise<void> | void): Promise<void> {
  try {
    await action();
  } catch (err) {
    log(source, { type: "error", detail: err instanceof Error ? err.message : String(err) });
  }
}

export function setOutput(next: Output): Promise<void> {
  const previous = output.value;
  if (next === previous) return Promise.resolve();
  output.value = next;
  return run(previous, () => (previous === "cast" ? cast?.stop(0) : local.stop(0)));
}

export function play(entry: LibraryTrack | undefined): Promise<void> {
  return run(output.value, () => {
    if (!entry) throw new Error("No track selected");
    const url = audioUrl(entry.track.file);
    log(output.value, { type: "info", detail: `requesting ${entry.track.title} (${url})` });
    return adapter().play(url, entry.track.title, FADE_MS);
  });
}

export const stop = () => run(output.value, () => adapter().stop(FADE_MS));
export const seekNearEnd = () => run(output.value, () => adapter().seekNearEnd(20));
export const setVolume = (level: number) => run(output.value, () => adapter().setVolume(level));
export const connectCast = () => run("cast", () => cast?.connect());

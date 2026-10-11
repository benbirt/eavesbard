// Playback state and actions, shared by the UI. State lives in signals so
// components update when playback or Cast events change it.

import { signal } from "@preact/signals";
import type { PlaybackAdapter, PlaybackEvent } from "./playback/adapter.js";
import { CastAdapter, loadCastSdk } from "./playback/cast.js";
import { LocalAdapter } from "./playback/local.js";
import type { LibraryTrack } from "./library/tag-map.js";
import { record } from "./timeline.js";
import { audioUrl } from "./tracks.js";

const FADE_MS = 4000;

/** How long to let Cast discovery run before suggesting why it found nothing. */
const CAST_HINT_DELAY_MS = 8000;

export type Output = "local" | "cast";

export interface CastStatus {
  /** undefined while the SDK is loading. */
  available: boolean | undefined;
  /** The SDK's view of the network, e.g. "no Cast devices found on this network". */
  state: string;
  /** Set once discovery has found nothing for a while: what the user should check. */
  hint: string;
}

export const output = signal<Output>("local");
/** The track most recently started, whichever output it's on. */
export const nowPlaying = signal<LibraryTrack | undefined>(undefined);
/** Whether the current track is paused. */
export const paused = signal(false);
/** Whether the current track has been asked for but isn't audible yet (loading or buffering). */
export const loading = signal(false);
/** Output level, 0 to 1. */
export const volume = signal(1);
export const castStatus = signal<CastStatus>({ available: undefined, state: "", hint: "" });
const endedListeners: (() => void)[] = [];
const failedListeners: ((entry: LibraryTrack) => void)[] = [];
/** Tracks that failed to play this session (e.g. the file is missing on the audio host). */
const failed = new Set<number>();

function log(source: Output, event: PlaybackEvent): void {
  // Everything goes in the session log; errors are shown by default, the rest under "Playback details".
  if (event.type === "error") record({ kind: "error", text: `Playback (${source}): ${event.detail}` });
  else record({ kind: "playback", output: source, type: event.type, detail: event.detail });
  if (source !== output.value) return;
  if (event.type === "waiting") loading.value = true;
  if (event.type === "playing" || event.type === "ended") loading.value = false;
  // Only the active output's track ending matters.
  if (event.type === "ended") for (const listener of endedListeners) listener();
}

/** The playing track couldn't be played: remember it, and tell the director once. */
function trackFailed(source: Output, entry = nowPlaying.value): void {
  if (source !== output.value || !entry || failed.has(entry.track.id)) return;
  loading.value = false;
  failed.add(entry.track.id);
  for (const listener of failedListeners) listener(entry);
}

/** Calls `listener` once for each track that fails to play. */
export function onTrackFailed(listener: (entry: LibraryTrack) => void): void {
  failedListeners.push(listener);
}

/** Whether a track has failed to play this session. */
export const hasFailed = (id: number) => failed.has(id);

/** Calls `listener` whenever the playing track reaches its end. */
export function onTrackEnded(listener: () => void): void {
  endedListeners.push(listener);
}

const local = new LocalAdapter();
local.onEvent((e) => {
  log("local", e);
  if (e.type === "error") trackFailed("local");
});
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
    if (e.type === "error") trackFailed("cast");
    update();
  });
  // Casting ended elsewhere (Chrome's menu, the device): bring the music back here.
  adapter.onSessionEnded(() => {
    if (output.value === "cast") void moveTo("local");
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

export async function play(entry: LibraryTrack | undefined): Promise<void> {
  const source = output.value;
  try {
    if (!entry) throw new Error("No track selected");
    const url = audioUrl(entry.track.file);
    log(source, { type: "info", detail: `requesting ${entry.track.title} (${url})` });
    nowPlaying.value = entry;
    paused.value = false;
    loading.value = true;
    await adapter().play(url, entry.track.title, FADE_MS);
  } catch (err) {
    // A missing file is reported by the adapter's own error event (trackFailed);
    // other failures here, such as Cast not being ready, aren't the track's fault.
    log(source, { type: "error", detail: err instanceof Error ? err.message : String(err) });
    loading.value = false;
  }
}

/** Where the playing track is, for progress display. */
export function playbackPosition(): { currentS: number; durationS: number } | undefined {
  try {
    return adapter().position();
  } catch {
    return undefined;
  }
}

export const stop = () =>
  run(output.value, () => {
    nowPlaying.value = undefined;
    paused.value = false;
    loading.value = false;
    return adapter().stop(FADE_MS);
  });
export const seekTo = (seconds: number) => run(output.value, () => adapter().seekTo(seconds));
export const setVolume = (level: number) =>
  run(output.value, () => {
    volume.value = level;
    adapter().setVolume(level);
  });
export const setPaused = (on: boolean) =>
  run(output.value, () => {
    if (!nowPlaying.value) return;
    paused.value = on;
    adapter().setPaused(on);
  });
/** Switches output, taking the current track along (it restarts there). */
async function moveTo(next: Output): Promise<void> {
  const playing = nowPlaying.value;
  const wasPaused = paused.value;
  await setOutput(next);
  if (playing && !wasPaused) await play(playing);
}

/**
 * Asks the browser for a Cast device, then moves the music there. If the
 * chooser is cancelled or fails, the music stays on this computer.
 */
export async function startCasting(): Promise<void> {
  try {
    if (!cast) throw new Error("Cast isn't ready");
    await cast.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Closing the chooser isn't an error.
    log("cast", { type: message.includes("cancel") ? "info" : "error", detail: message });
    return;
  }
  await moveTo("cast");
}

/** Brings the music back to this computer and ends the Cast session. */
export async function stopCasting(): Promise<void> {
  await moveTo("local");
  cast?.disconnect();
}

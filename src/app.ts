import type { PlaybackAdapter, PlaybackEvent } from "./playback/adapter.js";
import { CastAdapter, loadCastSdk } from "./playback/cast.js";
import { LocalAdapter } from "./playback/local.js";
import { loadApiKey, saveApiKey } from "./settings.js";
import { indexGenerated, library } from "./library-data.js";
import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "./library/scenes.js";
import { bucket, type LibraryTrack } from "./library/tag-map.js";
import { audioUrl } from "./tracks.js";

const FADE_MS = 4000;

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

// --- Settings ---

const apiKeyInput = $<HTMLInputElement>("api-key");
const apiKeyStatus = $("api-key-status");
apiKeyInput.value = loadApiKey();
$("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const key = apiKeyInput.value.trim();
  apiKeyStatus.textContent = saveApiKey(key)
    ? key ? "Saved in this browser." : "Cleared."
    : "Couldn't save: this browser is blocking local storage.";
});

// --- Track picker ---

const settingSelect = $<HTMLSelectElement>("setting");
const intensitySelect = $<HTMLSelectElement>("intensity");
const trackSelect = $<HTMLSelectElement>("track");
const trackInfo = $("track-info");
const outputLocal = $<HTMLInputElement>("output-local");
const outputCast = $<HTMLInputElement>("output-cast");
const castStatus = $("cast-status");
const log = $("event-log");

$("library-status").textContent =
  `Index generated ${indexGenerated.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}: ` +
  `${library.tracks.length} tracks in use, ${library.unmapped.length} unmapped, ` +
  `${library.outOfScope.length} out of scope (e.g. sci-fi).`;

const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);
for (const s of SETTINGS) settingSelect.add(new Option(capitalise(s), s));
for (const i of INTENSITIES) intensitySelect.add(new Option(capitalise(i), i));

function currentBucket(): LibraryTrack[] {
  return bucket(library, settingSelect.value as Setting, intensitySelect.value as Intensity);
}

function showTrackInfo(): void {
  const entry = currentBucket().find((t) => String(t.track.id) === trackSelect.value);
  trackInfo.textContent = entry
    ? `${entry.track.description || "No description."} Settings: ${entry.settings.join(", ")}. ` +
      `Intensities: ${entry.intensities.join(", ")}.`
    : "";
}

function showBucket(): void {
  const tracks = currentBucket();
  trackSelect.replaceChildren(...tracks.map((t) => new Option(t.track.title, String(t.track.id))));
  // Option labels show how many tracks each choice offers.
  SETTINGS.forEach((s, n) => {
    const count = library.tracks.filter((t) => t.settings.includes(s)).length;
    settingSelect.options[n]!.text = `${capitalise(s)} (${count})`;
  });
  INTENSITIES.forEach((i, n) => {
    intensitySelect.options[n]!.text = `${capitalise(i)} (${bucket(library, settingSelect.value as Setting, i).length})`;
  });
  showTrackInfo();
}

settingSelect.addEventListener("change", showBucket);
intensitySelect.addEventListener("change", showBucket);
trackSelect.addEventListener("change", showTrackInfo);
showBucket();

function logEvent(source: string, event: PlaybackEvent): void {
  const item = document.createElement("li");
  item.className = event.type;
  item.textContent = `${new Date().toLocaleTimeString("en-GB")} [${source}] ${event.type}: ${event.detail}`;
  log.prepend(item);
}

const local = new LocalAdapter();
local.onEvent((e) => logEvent("local", e));

let castAdapter: CastAdapter | undefined;
loadCastSdk().then((available) => {
  if (!available) {
    castStatus.textContent = "Casting isn't available in this browser.";
    return;
  }
  castAdapter = new CastAdapter();
  castAdapter.onEvent((e) => logEvent("cast", e));
  outputCast.disabled = false;
  castStatus.textContent = "Use the Cast button to connect a device.";
});

function adapter(): PlaybackAdapter {
  if (outputCast.checked) {
    if (!castAdapter) throw new Error("Cast isn't ready");
    return castAdapter;
  }
  return local;
}

function selectedTrack(): LibraryTrack | undefined {
  return currentBucket().find((t) => String(t.track.id) === trackSelect.value);
}

async function run(source: string, action: () => Promise<void> | void): Promise<void> {
  try {
    await action();
  } catch (err) {
    logEvent(source, { type: "error", detail: err instanceof Error ? err.message : String(err) });
  }
}

const source = () => (outputCast.checked ? "cast" : "local");

function playTrack(entry: LibraryTrack | undefined): Promise<void> {
  if (!entry) throw new Error("No track selected");
  const url = audioUrl(entry.track.file);
  logEvent(source(), { type: "info", detail: `requesting ${entry.track.title} (${url})` });
  return adapter().play(url, entry.track.title, FADE_MS);
}

$("play").addEventListener("click", () => run(source(), () => playTrack(selectedTrack())));
$("random").addEventListener("click", () =>
  run(source(), () => {
    const tracks = currentBucket();
    const entry = tracks[Math.floor(Math.random() * tracks.length)];
    if (entry) {
      trackSelect.value = String(entry.track.id);
      showTrackInfo();
    }
    return playTrack(entry);
  }),
);
$("stop").addEventListener("click", () => run(source(), () => adapter().stop(FADE_MS)));
$("seek").addEventListener("click", () => run(source(), () => adapter().seekNearEnd(20)));
$<HTMLInputElement>("volume").addEventListener("input", (e) =>
  run(source(), () => adapter().setVolume(Number((e.target as HTMLInputElement).value))),
);
outputLocal.addEventListener("change", () => run("cast", () => castAdapter?.stop(0)));
outputCast.addEventListener("change", () => run("local", () => local.stop(0)));

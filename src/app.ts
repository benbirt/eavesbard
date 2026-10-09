import type { PlaybackAdapter, PlaybackEvent } from "./playback/adapter.js";
import { CastAdapter, loadCastSdk } from "./playback/cast.js";
import { LocalAdapter } from "./playback/local.js";
import { loadApiKey, saveApiKey } from "./settings.js";
import { audioUrl, E1_TRACKS } from "./tracks.js";

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

// --- E1 playback test ---

const trackSelect = $<HTMLSelectElement>("track");
const customFile = $<HTMLInputElement>("custom-file");
const outputLocal = $<HTMLInputElement>("output-local");
const outputCast = $<HTMLInputElement>("output-cast");
const castStatus = $("cast-status");
const log = $("event-log");

for (const track of E1_TRACKS) trackSelect.add(new Option(track.title, track.file));

function logEvent(source: string, event: PlaybackEvent): void {
  const item = document.createElement("li");
  item.className = event.type;
  item.textContent = `${new Date().toLocaleTimeString()} [${source}] ${event.type}: ${event.detail}`;
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

function selectedTrack(): { file: string; title: string } {
  const file = customFile.value.trim();
  if (file) return { file, title: file };
  const option = trackSelect.selectedOptions[0];
  return { file: trackSelect.value, title: option?.text ?? trackSelect.value };
}

async function run(source: string, action: () => Promise<void> | void): Promise<void> {
  try {
    await action();
  } catch (err) {
    logEvent(source, { type: "error", detail: err instanceof Error ? err.message : String(err) });
  }
}

const source = () => (outputCast.checked ? "cast" : "local");

$("play").addEventListener("click", () =>
  run(source(), () => {
    const track = selectedTrack();
    logEvent(source(), { type: "info", detail: `requesting ${audioUrl(track.file)}` });
    return adapter().play(audioUrl(track.file), track.title, FADE_MS);
  }),
);
$("stop").addEventListener("click", () => run(source(), () => adapter().stop(FADE_MS)));
$("seek").addEventListener("click", () => run(source(), () => adapter().seekNearEnd(20)));
$<HTMLInputElement>("volume").addEventListener("input", (e) =>
  run(source(), () => adapter().setVolume(Number((e.target as HTMLInputElement).value))),
);
outputLocal.addEventListener("change", () => run("cast", () => castAdapter?.stop(0)));
outputCast.addEventListener("change", () => run("local", () => local.stop(0)));

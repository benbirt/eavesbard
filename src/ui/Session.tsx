import { useEffect, useState } from "preact/hooks";
import {
  auto,
  checking,
  description,
  differentTrack,
  effectiveEngine,
  engine,
  lastChange,
  newSpeech,
  nextCheckAt,
  CADENCE_MS,
  running,
  scene,
  setDescription,
  setSceneYourself,
  startSession,
  stopSession,
} from "../director.js";
import { allowDownloads, downloadsAllowed, knownDownloaded, refreshStoredBytes, storedModelBytes } from "../downloads.js";
import { hasWebGpu } from "../gpu.js";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { model, speechModel } from "../listener.js";
import { localModel } from "../local-models.js";
import { loadApiKey } from "../settings.js";
import { hasWebSpeech } from "../stt/web-speech.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { sceneLlm } from "../llm/scene-llm.js";
import { loading, nowPlaying, paused, playbackPosition, seekTo, setPaused, setVolume, volume } from "../player.js";
import { pendingChanges } from "../scene/state-machine.js";
import { isWebSpeech, whisperRepo, WHISPER_DOWNLOAD_MB } from "../stt/protocol.js";

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Re-renders every second, for countdowns and progress. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Before a session: describe the opening scene and begin. */
export function StartCard() {
  return (
    <form
      class="card start"
      onSubmit={(e) => {
        e.preventDefault();
        void startSession();
      }}
    >
      <h2>Set the scene</h2>
      <p>Describe where the party begins, or leave it blank and let the table talk decide.</p>
      <input
        type="text"
        value={description.value}
        placeholder="the party arrives at a busy port at dusk"
        aria-label="Opening scene"
        onInput={(e) => setDescription(e.currentTarget.value)}
      />
      <button type="submit" class="begin" disabled={beginBlocker() !== undefined}>
        {beginBlocker() ?? "Begin session"}
      </button>
      {!auto.value && <p class="small">Automatic music is off: pick tracks below, or turn it on in Setup (More…).</p>}
      <DownloadOffer />
    </form>
  );
}

/**
 * Nothing large downloads just from opening the page: this offers the
 * downloads still needed, which Begin session would also start.
 */
function DownloadOffer() {
  const { total, remaining } = pendingDownload();
  if (total === 0) return null;
  // Part already stored (an earlier, unfinished download): say how much is left.
  const label = remaining < total * 0.98 ? `${size(remaining)} of ${size(total)} remaining` : size(total);
  return (
    <div class="download-offer">
      <button type="button" class="btn" onClick={allowDownloads}>
        Download now ({label})
      </button>
      <p class="small">Only once: the browser keeps them.</p>
    </div>
  );
}

/**
 * Why a session can't begin yet, if it can't: the models it needs must be
 * loaded (or, for Claude, an API key saved), so it starts working at once.
 */
function beginBlocker(): string | undefined {
  const speech = model.value;
  const m = speechModel.value;
  const local = auto.value && effectiveEngine() === "local";
  if (auto.value && engine.value === "claude" && !loadApiKey()) return "Add an Anthropic API key in Setup first";
  const notDownloaded =
    (!isWebSpeech(speech) && m.phase === "off" && knownDownloaded(whisperRepo(speech)) === false) ||
    (local && hasWebGpu && sceneLlm.value.phase === "off" && knownDownloaded(SCENE_LLM.repo) === false);
  if (notDownloaded && !downloadsAllowed.value) return "Download the models to begin";
  if (isWebSpeech(speech) ? !hasWebSpeech : m.phase !== "ready") {
    if (isWebSpeech(speech)) return "This browser has no speech recognition";
    return m.phase === "error" ? "The speech model didn't load" : "Waiting for the speech model…";
  }
  if (local) {
    const embed = localModel.value.phase;
    if (embed !== "ready" && embed !== "indexing") return "Waiting for the scene model…";
    if (hasWebGpu && sceneLlm.value.phase !== "ready") {
      return sceneLlm.value.phase === "error" ? "The scene model didn't load" : "Waiting for the scene model…";
    }
  }
  return undefined;
}

/**
 * How much the session would download that the user hasn't chosen to yet:
 * only models known not to be fully downloaded (0 while that's still being
 * checked, so a downloaded model never flashes up an offer).
 */
function pendingDownload(): { total: number; remaining: number } {
  if (downloadsAllowed.value) return { total: 0, remaining: 0 };
  const missing = (repo: string, phase: string) => phase === "off" && knownDownloaded(repo) === false;
  const models: [string, number][] = [];
  const speech = model.value;
  if (!isWebSpeech(speech) && missing(whisperRepo(speech), speechModel.value.phase)) models.push([whisperRepo(speech), WHISPER_DOWNLOAD_MB[speech]]);
  if (auto.value && effectiveEngine() === "local" && hasWebGpu && missing(SCENE_LLM.repo, sceneLlm.value.phase)) {
    models.push([SCENE_LLM.repo, SCENE_LLM.downloadMb]);
  }
  let total = 0;
  let remaining = 0;
  for (const [repo, mb] of models) {
    const stored = storedModelBytes.value.get(repo);
    if (stored === undefined) void refreshStoredBytes(repo);
    total += mb;
    remaining += Math.max(0, mb - (stored ?? 0) / 1e6);
  }
  return { total, remaining: Math.round(remaining) };
}

const size = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);

/** How long ago, roughly: "just now", "40 s ago", "3 min ago". */
function ago(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 10 ? "just now" : s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
}

/** When the scene will next be checked, and any change in waiting. */
function CheckStatus({ now }: { now: number }) {
  const s = scene.value!;
  const pending = pendingChanges(s, now);
  const at = nextCheckAt.value;
  const counting = !checking.value && newSpeech.value && at !== undefined;
  const left = counting ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
  return (
    <div class="status">
      <p class="next">
        {checking.value
          ? "Checking the scene…"
          : counting
            ? `Next check in ${left} s`
            : "Next check when someone speaks"}
      </p>
      {counting && (
        <div class="bar thin" aria-hidden="true">
          <i style={{ width: `${100 * (1 - (left * 1000) / CADENCE_MS)}%` }} />
        </div>
      )}
      {pending.map((p) => (
        <p class="pending" key={p}>
          {p}
        </p>
      ))}
    </div>
  );
}

/** The scene: what Eavesbard thinks is happening, and a way to correct it. */
export function SceneCard() {
  const now = useNow();
  const s = scene.value;
  if (!s) {
    return (
      <section class="card" aria-live="polite">
        <p class="eyebrow">The scene</p>
        <p class="why">{running.value ? "Choosing the opening scene…" : "Automatic music is off."}</p>
      </section>
    );
  }
  const change = lastChange.value;
  return (
    <section class="card" aria-live="polite">
      <p class="eyebrow">The scene</p>
      <h1 class="scene-name">
        {cap(s.setting)} <span class="badge">{cap(s.intensity)}</span>
      </h1>
      {change && (
        <p class="why">
          {change.heard ? (
            <>
              “{change.heard}” → {change.text}
            </>
          ) : (
            change.text
          )}{" "}
          <span class="muted">· {ago(now - change.at)}</span>
        </p>
      )}
      <CheckStatus now={now} />
      <div class="override">
        <p>Tap to set the scene yourself</p>
        <div class="pills" role="group" aria-label="Setting">
          {SETTINGS.map((x) => (
            <button type="button" class="pill" key={x} aria-pressed={x === s.setting} onClick={() => setSceneYourself({ setting: x })}>
              {cap(x)}
            </button>
          ))}
        </div>
        <div class="pills" role="group" aria-label="Intensity">
          {INTENSITIES.map((x) => (
            <button type="button" class="pill" key={x} aria-pressed={x === s.intensity} onClick={() => setSceneYourself({ intensity: x })}>
              {cap(x)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The track's progress; drag or click anywhere on it to seek. */
function SeekBar({ currentS, durationS }: { currentS: number; durationS: number }) {
  // While dragging, show where the thumb is rather than where playback is.
  const [dragS, setDragS] = useState<number | undefined>(undefined);
  const shownS = dragS ?? currentS;
  return (
    <div class="seek">
      <div class="bar" aria-hidden="true">
        <i style={{ width: `${(100 * shownS) / durationS}%`, transition: dragS === undefined ? undefined : "none" }} />
      </div>
      <input
        type="range"
        min="0"
        max={durationS}
        step="1"
        value={shownS}
        aria-label="Position in track"
        aria-valuetext={`${mmss(shownS)} of ${mmss(durationS)}`}
        onInput={(e) => setDragS(Number(e.currentTarget.value))}
        onChange={(e) => {
          void seekTo(Number(e.currentTarget.value));
          setDragS(undefined);
        }}
      />
    </div>
  );
}

/** What's playing, with the controls a GM reaches for mid-session. */
export function MusicCard() {
  useNow();
  const playing = nowPlaying.value;
  const position = playing ? playbackPosition() : undefined;
  return (
    <section class="card">
      <p class="eyebrow">Now playing</p>
      {playing ? (
        <>
          <p class="track">{playing.track.title}</p>
          <p class="src">
            Tabletop Audio
            {loading.value ? (
              <span class="loading" role="status">
                {" "}· loading…
              </span>
            ) : (
              position && ` · ${mmss(position.currentS)} / ${mmss(position.durationS)}`
            )}
          </p>
          {loading.value && !position ? (
            <div class="bar loading" aria-hidden="true">
              <i />
            </div>
          ) : position ? (
            <SeekBar currentS={position.currentS} durationS={position.durationS} />
          ) : (
            <div class="bar" aria-hidden="true" />
          )}
        </>
      ) : (
        <p class="src">Nothing yet.</p>
      )}
      <div class="transport">
        <button
          type="button"
          class="round primary"
          disabled={!playing}
          aria-label={paused.value ? "Resume" : "Pause"}
          onClick={() => void setPaused(!paused.value)}
        >
          {paused.value ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
          )}
        </button>
        <button type="button" class="round" disabled={!scene.value} aria-label="A different track" title="A different track" onClick={differentTrack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 5l9 7-9 7zM17 5v14" /></svg>
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume.value}
          aria-label="Volume"
          onInput={(e) => void setVolume(Number(e.currentTarget.value))}
        />
      </div>
    </section>
  );
}

export function StopButton() {
  return (
    <button type="button" class="stop" onClick={stopSession}>
      Stop session
    </button>
  );
}

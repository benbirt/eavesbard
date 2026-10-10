import { useEffect, useState } from "preact/hooks";
import {
  auto,
  checking,
  description,
  differentTrack,
  effectiveEngine,
  ENGINE_NAMES,
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
import { hasWebGpu } from "../gpu.js";
import { library } from "../library-data.js";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { model, transcript } from "../listener.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { sceneLlm } from "../llm/scene-llm.js";
import { nowPlaying, paused, playbackPosition, seekTo, setPaused, setVolume, volume } from "../player.js";
import { pendingChanges } from "../scene/state-machine.js";
import { isWebSpeech, WHISPER_DOWNLOAD_MB } from "../stt/protocol.js";
import { OutputSwitch } from "./Playback.js";

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
  const speech = model.value;
  const llm = sceneLlm.value;
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
      <button type="submit" class="begin">
        Begin session
      </button>
      <OutputSwitch />
      <ul class="ready">
        <li>{library.tracks.length} ambiences from Tabletop Audio</li>
        <li>
          Listening: {isWebSpeech(speech) ? "Web Speech" : `Whisper ${speech.replace(".en", "")}, about ${WHISPER_DOWNLOAD_MB[speech]} MB the first time`}
        </li>
        {auto.value && effectiveEngine() === "local" && (
          <li class={llm.phase === "ready" ? "" : "wait"}>
            {!hasWebGpu
              ? "Scenes: embeddings only (no WebGPU here)"
              : llm.phase === "ready"
                ? `Scenes: ${SCENE_LLM.name}, ready`
                : llm.phase === "loading"
                  ? `Scenes: downloading ${SCENE_LLM.name} (${(llm.loaded / 1e9).toFixed(1)} of ${(SCENE_LLM.downloadMb / 1000).toFixed(1)} GB); the embeddings decide until it's ready`
                  : `Scenes: ${SCENE_LLM.name}, about ${(SCENE_LLM.downloadMb / 1000).toFixed(1)} GB the first time`}
          </li>
        )}
        {!auto.value && <li class="wait">Automatic music is off: pick tracks yourself in Setup</li>}
      </ul>
    </form>
  );
}

/** The last thing heard, as a hint of why the scene is what it is. */
function lastHeard(): string | undefined {
  const lines = transcript.value;
  for (let i = lines.length - 1; i >= 0; i--) if (!lines[i]!.dropped) return lines[i]!.text;
  return undefined;
}

function NextCheck({ now }: { now: number }) {
  if (checking.value) return <span>checking…</span>;
  const at = nextCheckAt.value;
  if (!at) return null;
  const left = Math.max(0, Math.ceil((at - now) / 1000));
  return <span>{newSpeech.value ? `next check in ${left} s` : "next check when someone speaks"}</span>;
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
  const heard = lastHeard();
  const pending = pendingChanges(s, now);
  const left = nextCheckAt.value && newSpeech.value ? Math.max(0, nextCheckAt.value - now) : CADENCE_MS;
  return (
    <section class="card" aria-live="polite">
      <p class="eyebrow">The scene</p>
      <h1 class="scene-name">
        {cap(s.setting)} <span class="badge">{cap(s.intensity)}</span>
      </h1>
      <p class="why">
        {heard && <>“{heard}” · </>}
        {s.reason === "set by you" ? "set by you" : s.reason.replace(/^classifier: /, `${ENGINE_NAMES[effectiveEngine()]}: `)}
      </p>
      <div class="meta">
        <span>for {mmss((now - Math.max(s.settingSince, s.intensitySince)) / 1000)}</span>
        <NextCheck now={now} />
      </div>
      <div class="bar" aria-hidden="true">
        <i style={{ width: `${100 * (1 - left / CADENCE_MS)}%` }} />
      </div>
      {pending.length > 0 && <p class="pending">{pending.join(" · ")}</p>}
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
            Tabletop Audio{position && ` · ${mmss(position.currentS)} / ${mmss(position.durationS)}`}
          </p>
          {position ? (
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
      <OutputSwitch />
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

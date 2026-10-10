import { useEffect, useState } from "preact/hooks";
import {
  auto,
  checking,
  effectiveEngine,
  engine,
  ENGINE_NAMES,
  description,
  newSpeech,
  nextCheckAt,
  running,
  scene,
  sessionActive,
  sessionCost,
  setDescription,
  startSession,
  stopSession,
} from "../director.js";
import { pendingChanges } from "../scene/state-machine.js";
import { nowPlaying, playbackPosition } from "../player.js";
import { loadApiKey } from "../settings.js";
import { localModel } from "../local-models.js";
import { SceneLlmStatus } from "./SceneLlm.js";
import { ListeningStatus } from "./Listening.js";
import { OutputChooser } from "./Playback.js";

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

function StartBox() {
  return (
    <form
      class="start"
      onSubmit={(e) => {
        e.preventDefault();
        void startSession();
      }}
    >
      <label>
        Opening scene <span class="muted">(optional: a few words, e.g. “underground, exploring”)</span>
        <input
          type="text"
          value={description.value}
          placeholder="the party arrives at a busy port at dusk"
          onInput={(e) => setDescription(e.currentTarget.value)}
        />
      </label>
      {auto.value && engine.value === "claude" && !loadApiKey() && (
        <p class="muted">
          No Anthropic API key, so the local model will decide the scene and pick tracks. Add a key in Setup to use
          Claude.
        </p>
      )}
      <button type="submit" class="primary">
        Start session
      </button>
    </form>
  );
}

function NextCheck({ now }: { now: number }) {
  if (checking.value) return <span>Asking the {ENGINE_NAMES[effectiveEngine()].toLowerCase()}…</span>;
  const at = nextCheckAt.value;
  if (!at) return null;
  const left = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <span>
      {newSpeech.value ? `Next check in ${left} s` : "Next check when there's new speech"}
      <progress class="countdown" value={newSpeech.value ? 15 - left : 0} max={15} />
    </span>
  );
}

function NowStrip() {
  const now = useNow();
  const s = scene.value;
  const playing = nowPlaying.value;
  const position = playing ? playbackPosition() : undefined;
  const cost = sessionCost.value;
  return (
    <div class="now">
      {s ? (
        <>
          <p class="scene">
            <strong>
              {cap(s.setting)} · {cap(s.intensity)}
            </strong>{" "}
            <span class="muted">
              for {mmss((now - Math.max(s.settingSince, s.intensitySince)) / 1000)}: {s.reason}
            </span>
          </p>
          {pendingChanges(s, now).length > 0 && <p class="muted">Pending: {pendingChanges(s, now).join(" · ")}</p>}
          <p>
            <NextCheck now={now} />
          </p>
        </>
      ) : (
        running.value && <p>Choosing the opening scene…</p>
      )}
      {playing && (
        <p class="track">
          ♪ {playing.track.title}{" "}
          {position && (
            <>
              <progress value={position.currentS} max={position.durationS} />{" "}
              <span class="muted">
                {mmss(position.currentS)} / {mmss(position.durationS)}
              </span>
            </>
          )}
        </p>
      )}
      <p class="status">
        <ListeningStatus />
        {localModel.value.phase === "loading" && (
          <span class="muted">
            {" "}
            · Loading the local model ({Math.round(localModel.value.loaded / 1e6)} MB)
          </span>
        )}
        {localModel.value.phase === "error" && <span class="warning"> · {localModel.value.message}</span>}
        {cost.calls > 0 && (
          <span class="muted">
            {" "}
            · Claude: {cost.calls} call{cost.calls === 1 ? "" : "s"}, ${cost.usd.toFixed(4)} (
            {Math.round(cost.cachedShare * 100)}% cached)
          </span>
        )}
      </p>
      <SceneLlmStatus />
      <button onClick={stopSession}>Stop session</button>
    </div>
  );
}

export function Session() {
  return (
    <section class="session">
      {sessionActive.value ? <NowStrip /> : <StartBox />}
      <OutputChooser />
    </section>
  );
}

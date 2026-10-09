import { auto, lastRun, notice, scene, sessionCost, setAuto } from "../director.js";
import { state as listenState } from "../listener.js";
import { nowPlaying } from "../player.js";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Cost() {
  const c = sessionCost.value;
  if (c.calls === 0) return null;
  const cacheShare = c.inputTokens + c.cacheReadTokens > 0 ? c.cacheReadTokens / (c.inputTokens + c.cacheReadTokens) : 0;
  return (
    <p class="muted">
      Classifier cost this session: ${c.usd.toFixed(4)} over {c.calls} call{c.calls === 1 ? "" : "s"} (
      {pct(cacheShare)} of input from cache)
      {c.unpriced > 0 && `; ${c.unpriced} call(s) not priced: add the model to config/pricing.json`}.
    </p>
  );
}

function LastRun() {
  const run = lastRun.value;
  if (!run) return <p class="muted">The classifier runs every minute while there's new transcript.</p>;
  const at = run.at.toLocaleTimeString("en-GB");
  if (run.error) return <p class="warning">{`${at}: classifier failed: ${run.error} The scene stays as it is.`}</p>;
  const { classification: c, latencyMs } = run.result!;
  return (
    <p class="muted">
      {at}: classifier said {c.setting} ({pct(c.settingConfidence)}), {c.intensity} ({pct(c.intensityConfidence)}) in{" "}
      {(latencyMs / 1000).toFixed(1)} s: “{c.reason}”
    </p>
  );
}

export function Director() {
  const current = scene.value;
  const listening = listenState.value.phase === "listening";
  return (
    <fieldset>
      <legend>Automatic music</legend>
      <label>
        <input type="checkbox" checked={auto.value} onChange={(e) => setAuto(e.currentTarget.checked)} /> Choose music
        from what's said while listening
      </label>
      {auto.value && (
        <p class="muted">
          While listening, about the last two and a half minutes of transcript are sent to Anthropic once a minute to
          work out the scene. Let the table know.
        </p>
      )}
      {notice.value && current && <p class="warning">{notice.value}</p>}
      {current ? (
        <>
          <p class="scene">
            <strong>
              {current.setting}, {current.intensity}
            </strong>{" "}
            <span class="muted">
              (since {time(Math.max(current.settingSince, current.intensitySince))}: {current.reason})
            </span>
          </p>
          {nowPlaying.value && <p>Playing: {nowPlaying.value.track.title}</p>}
          <LastRun />
          <Cost />
        </>
      ) : (
        <p class="muted">
          {auto.value
            ? listening
              ? "Starting…"
              : "Start listening to begin."
            : "Off: pick tracks yourself below."}
        </p>
      )}
    </fieldset>
  );
}

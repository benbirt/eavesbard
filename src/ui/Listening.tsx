import {
  clearTranscript,
  model,
  setModel,
  speaking,
  start,
  state,
  stop,
  transcript,
  wakeLock,
} from "../listener.js";
import { WHISPER_DOWNLOAD_MB, WHISPER_MODELS, type WhisperModel } from "../stt/protocol.js";
import { useSignal } from "@preact/signals";

const MB = 1e6;

function LoadingProgress({ loaded, total, preparing }: { loaded: number; total: number; preparing: boolean }) {
  // Files report their sizes only as each download starts, so until the big
  // ones begin, use the expected size to keep the bar from jumping backwards.
  const expected = WHISPER_DOWNLOAD_MB[model.value] * MB;
  const max = Math.max(total, expected);
  return (
    <div class="progress">
      {/* No value: an indeterminate bar while the GPU setup runs. */}
      <progress value={preparing ? undefined : loaded} max={max} />
      <span class="muted">
        {preparing
          ? "Preparing the speech model for your graphics card…"
          : `Loading speech models: ${(loaded / MB).toFixed(0)} of about ${(max / MB).toFixed(0)} MB. ` +
            "They download once; later visits load them from the browser's cache."}
      </span>
    </div>
  );
}

const WAKE_LOCK_TEXT = {
  off: "",
  held: "Keeping the screen awake while listening.",
  lost: "The screen may sleep or lock: keep this tab visible to stay awake.",
  unsupported: "This browser can't keep the screen awake; stop the computer sleeping or locking yourself.",
};

export function Listening() {
  const showDropped = useSignal(false);
  const s = state.value;
  const active = s.phase === "loading" || s.phase === "listening";
  const lines = transcript.value.filter((l) => showDropped.value || !l.dropped).slice(-50).reverse();

  return (
    <fieldset>
      <legend>Listening</legend>
      <div class="row">
        <label>
          Speech model{" "}
          <select
            value={model.value}
            disabled={active}
            onChange={(e) => setModel(e.currentTarget.value as WhisperModel)}
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m} value={m}>
                Whisper {m} (about {WHISPER_DOWNLOAD_MB[m]} MB)
              </option>
            ))}
          </select>
        </label>
        <p>
          {active ? <button onClick={stop}>Stop listening</button> : <button onClick={start}>Start listening</button>}
        </p>
      </div>
      {s.phase === "loading" && <LoadingProgress loaded={s.loaded} total={s.total} preparing={s.preparing} />}
      {s.phase === "listening" && (
        <p>
          <span class={speaking.value ? "dot speaking" : "dot"} /> {speaking.value ? "Hearing speech…" : "Listening"}
        </p>
      )}
      {s.phase === "error" && <p class="warning">{s.message}</p>}
      {wakeLock.value !== "off" && (
        <p class={wakeLock.value === "held" ? "muted" : "warning"}>{WAKE_LOCK_TEXT[wakeLock.value]}</p>
      )}
      <p class="muted">
        Speech is transcribed on this computer; no audio leaves the browser.{" "}
        <label class="inline">
          <input
            type="checkbox"
            checked={showDropped.value}
            onChange={(e) => (showDropped.value = e.currentTarget.checked)}
          />{" "}
          Show lines the hallucination filter dropped
        </label>{" "}
        <button onClick={clearTranscript}>Clear</button>
      </p>
      <ol class="transcript">
        {lines.map((l) => (
          <li key={l.id} class={l.dropped ? "dropped" : undefined}>
            <span class="muted">{l.time.toLocaleTimeString("en-GB")}</span> {l.text}
            {l.dropped ? (
              <span class="muted"> (dropped: {l.dropped})</span>
            ) : (
              <span class="muted">
                {" "}
                ({l.durationS.toFixed(1)} s of speech, transcribed in {((l.latencyMs ?? 0) / 1000).toFixed(1)} s)
              </span>
            )}
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

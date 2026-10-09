import { model, setModel, speaking, state, wakeLock } from "../listener.js";
import { WHISPER_DOWNLOAD_MB, WHISPER_MODELS, type WhisperModel } from "../stt/protocol.js";

const MB = 1e6;

/** Chooses the Whisper model (in the setup section). */
export function SpeechModelChooser() {
  const active = state.value.phase === "loading" || state.value.phase === "listening";
  return (
    <label>
      Speech model{" "}
      <select value={model.value} disabled={active} onChange={(e) => setModel(e.currentTarget.value as WhisperModel)}>
        {WHISPER_MODELS.map((m) => (
          <option key={m} value={m}>
            Whisper {m} (about {WHISPER_DOWNLOAD_MB[m]} MB)
          </option>
        ))}
      </select>{" "}
      <span class="muted">Bigger is more accurate but slower. Downloaded once, then cached.</span>
    </label>
  );
}

function LoadingProgress({ loaded, total, preparing }: { loaded: number; total: number; preparing: boolean }) {
  // Files report their sizes only as each download starts, so until the big
  // ones begin, use the expected size to keep the bar from jumping backwards.
  const max = Math.max(total, WHISPER_DOWNLOAD_MB[model.value] * MB);
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
  held: "Screen kept awake.",
  lost: "The screen may sleep or lock: keep this tab visible.",
  unsupported: "This browser can't keep the screen awake.",
};

/** Listening status for the "now" strip. */
export function ListeningStatus() {
  const s = state.value;
  return (
    <>
      {s.phase === "loading" && <LoadingProgress loaded={s.loaded} total={s.total} preparing={s.preparing} />}
      {s.phase === "error" && <p class="warning">{s.message}</p>}
      {s.phase === "listening" && (
        <span>
          <span class={speaking.value ? "dot speaking" : "dot"} /> {speaking.value ? "Hearing speech" : "Listening"}
        </span>
      )}
      {wakeLock.value !== "off" && (
        <span class={wakeLock.value === "held" ? "muted" : "warning"}> · {WAKE_LOCK_TEXT[wakeLock.value]}</span>
      )}
    </>
  );
}

import { model, setModel, state, wakeLock } from "../listener.js";
import { isWebSpeech, WHISPER_DOWNLOAD_MB, WHISPER_MODELS, type SpeechModel } from "../stt/protocol.js";
import { hasWebSpeech } from "../stt/web-speech.js";

const RECOMMENDED = "small.en";

/** Chooses the speech-to-text model (in Setup). */
export function SpeechModelChooser() {
  const active = state.value.phase === "loading" || state.value.phase === "listening";
  const m = model.value;
  return (
    <>
      <select class="field" value={m} disabled={active} aria-label="Speech model" onChange={(e) => setModel(e.currentTarget.value as SpeechModel)}>
        {WHISPER_MODELS.map((w) => (
          <option key={w} value={w}>
            Whisper {w.replace(".en", "")}
            {w === RECOMMENDED ? " (recommended)" : ""} · about {WHISPER_DOWNLOAD_MB[w]} MB once
          </option>
        ))}
        <option value="webspeech-device">Web Speech, on-device (Chrome only)</option>
        <option value="webspeech-cloud">Web Speech, cloud (sends audio to the browser's maker)</option>
      </select>
      {active && <p>Stop the session to change it.</p>}
      {isWebSpeech(m) ? (
        <p class="warning small">
          {hasWebSpeech ? "" : "This browser has no Web Speech recognition. "}
          Web Speech is designed for Chrome; other browsers may not work.
          {m === "webspeech-cloud"
            ? " In this mode the browser sends what the microphone hears to its maker's servers: let the table know."
            : " On-device mode needs a recent Chrome, which may download its own speech model first."}
        </p>
      ) : (
        <p>Runs on this computer. Bigger models hear better but take longer to download.</p>
      )}
      {wakeLock.value === "unsupported" && <p class="warning small">This browser can't keep the screen awake: keep it from sleeping yourself.</p>}
    </>
  );
}

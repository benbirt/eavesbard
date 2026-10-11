import type { ComponentChildren } from "preact";
import { model, setModel, state, wakeLock } from "../listener.js";
import { WHISPER_DOWNLOAD_MB, type SpeechModel } from "../stt/protocol.js";
import { hasWebSpeech } from "../stt/web-speech.js";

/** One option card: a radio button with a name and a line of explanation. */
export function Choice({
  name,
  checked,
  onPick,
  title,
  disabled = false,
  children,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onPick: () => void;
  title: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <label class="radio">
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onPick} />
      <span>
        {title}
        <small>{children}</small>
      </span>
    </label>
  );
}

const TRANSCRIPTION: { value: SpeechModel; title: string; note: string }[] = [
  { value: "small.en", title: "Whisper small (recommended)", note: `On this computer · about ${WHISPER_DOWNLOAD_MB["small.en"]} MB once · hears best, especially with music playing` },
  { value: "base.en", title: "Whisper base", note: `On this computer · about ${WHISPER_DOWNLOAD_MB["base.en"]} MB once` },
  { value: "tiny.en", title: "Whisper tiny", note: `On this computer · about ${WHISPER_DOWNLOAD_MB["tiny.en"]} MB once · quickest to download, misses more` },
  { value: "webspeech-device", title: "The browser's own, on this computer", note: "Recent Chrome only, which may download its own speech model first" },
  { value: "webspeech-cloud", title: "The browser's own, in the cloud", note: "Sends what the microphone hears to the browser's maker (Google, for Chrome): let the table know" },
];

/** Chooses how speech becomes text (in Setup). */
export function SpeechModelChooser() {
  const active = state.value.phase === "loading" || state.value.phase === "listening";
  const m = model.value;
  return (
    <>
      {TRANSCRIPTION.map((o) => (
        <Choice key={o.value} name="transcription" checked={m === o.value} disabled={active} onPick={() => setModel(o.value)} title={o.title}>
          {o.note}
        </Choice>
      ))}
      {active && <p>Stop the session to change it.</p>}
      {!hasWebSpeech && <p class="small">This browser has no speech recognition of its own, so only Whisper works here.</p>}
      {wakeLock.value === "unsupported" && <p class="warning small">This browser can't keep the screen awake: keep it from sleeping yourself.</p>}
    </>
  );
}

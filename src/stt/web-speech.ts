// Speech-to-text with the browser's own Web Speech API, as an alternative to
// Whisper. "Cloud" is the API's default: Chrome sends the audio to Google.
// "On-device" sets `processLocally`, which needs a recent Chrome and may
// first download a language pack. Other browsers may support neither.

// Not (fully) in TypeScript's DOM types yet.
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [i: number]: RecognitionResult };
}
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: Event & { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
}
type InstallOptions = { langs: string[]; processLocally: boolean };
interface RecognitionClass {
  new (): Recognition;
  available?(options: InstallOptions): Promise<string | boolean>;
  install?(options: InstallOptions): Promise<boolean>;
}

const LANG = "en-US";

function recognitionClass(): RecognitionClass | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const hasWebSpeech = typeof window !== "undefined" && recognitionClass() !== undefined;

export interface WebSpeechCallbacks {
  /** A finished phrase, with when it started and ended (ms since the epoch). */
  onLine(text: string, startedAt: number, endedAt: number): void;
  onSpeaking(speaking: boolean): void;
  /** Recognition stopped for good. */
  onFatal(message: string): void;
  /** The browser is downloading its on-device speech model. */
  onInstalling(): void;
}

/** Makes sure on-device recognition is possible, installing the language pack if needed. */
async function ensureOnDevice(Rec: RecognitionClass, onInstalling: () => void): Promise<void> {
  const options = { langs: [LANG], processLocally: true };
  if (typeof Rec.available !== "function") {
    throw new Error("This browser can't do on-device Web Speech recognition. Try a recent Chrome, the cloud option or Whisper.");
  }
  const status = await Rec.available(options);
  if (status === "available" || status === true) return;
  if (status === "unavailable" || status === false || typeof Rec.install !== "function") {
    throw new Error("On-device Web Speech recognition isn't available for English in this browser. Try the cloud option or Whisper.");
  }
  onInstalling();
  if (!(await Rec.install(options))) throw new Error("The browser couldn't download its on-device speech model.");
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access was refused.",
  "service-not-allowed": "The browser refused to run speech recognition here.",
  "audio-capture": "No microphone was found.",
  network: "Web Speech couldn't reach the browser's speech service.",
  "language-not-supported": "This browser's Web Speech can't recognise English here.",
};

/** Starts recognising speech. Recognition restarts itself whenever the browser ends it. */
export async function startWebSpeech(onDevice: boolean, cb: WebSpeechCallbacks): Promise<{ stop(): void }> {
  const Rec = recognitionClass();
  if (!Rec) throw new Error("This browser has no Web Speech recognition. Try Chrome, or a Whisper model.");
  if (onDevice) await ensureOnDevice(Rec, cb.onInstalling);

  const rec = new Rec();
  rec.lang = LANG;
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  if (onDevice) rec.processLocally = true;

  let stopped = false;
  let speechStart: number | undefined;
  let restarts: number[] = [];

  rec.onspeechstart = () => {
    speechStart ??= Date.now();
    cb.onSpeaking(true);
  };
  rec.onspeechend = () => cb.onSpeaking(false);
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]!;
      const text = result[0].transcript.trim();
      if (!result.isFinal || !text) continue;
      const now = Date.now();
      cb.onLine(text, speechStart ?? now, now);
      speechStart = undefined;
    }
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return; // Silence; it restarts.
    stopped = true;
    cb.onFatal(ERRORS[e.error] ?? `Web Speech failed (${e.error}${e.message ? `: ${e.message}` : ""}).`);
  };
  // The browser ends recognition after silences or a time limit: start again.
  rec.onend = () => {
    cb.onSpeaking(false);
    if (stopped) return;
    const now = Date.now();
    restarts = [...restarts.filter((t) => now - t < 10_000), now];
    if (restarts.length > 5) {
      stopped = true;
      cb.onFatal("Web Speech keeps stopping straight away, so listening has stopped.");
      return;
    }
    setTimeout(() => {
      try {
        if (!stopped) rec.start();
      } catch {
        // Already started again.
      }
    }, 250);
  };
  rec.start();
  return {
    stop() {
      stopped = true;
      rec.stop();
    },
  };
}

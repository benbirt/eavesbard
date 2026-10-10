// Messages between the page and the speech-to-text worker.

export const WHISPER_MODELS = ["tiny.en", "base.en", "small.en"] as const;
export type WhisperModel = (typeof WHISPER_MODELS)[number];

/** Approximate one-off download sizes, for the model chooser. */
export const WHISPER_DOWNLOAD_MB: Record<WhisperModel, number> = { "tiny.en": 120, "base.en": 205, "small.en": 590 };

/** Speech-to-text choices: Whisper here, or the browser's own Web Speech recognition. */
export const WEB_SPEECH_MODES = ["webspeech-device", "webspeech-cloud"] as const;
export type WebSpeechMode = (typeof WEB_SPEECH_MODES)[number];
export type SpeechModel = WhisperModel | WebSpeechMode;
export const SPEECH_MODELS: readonly SpeechModel[] = [...WHISPER_MODELS, ...WEB_SPEECH_MODES];
export const isWebSpeech = (m: SpeechModel): m is WebSpeechMode => (WEB_SPEECH_MODES as readonly string[]).includes(m);

export type ToWorker =
  /** Load the models. Must come first. */
  | { type: "load"; model: WhisperModel }
  /** One frame of 16 kHz mono audio (512 samples). */
  | { type: "audio"; samples: Float32Array }
  /** Listening stopped: transcribe anything in progress and reset. */
  | { type: "flush" };

export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  /** Downloads are done; the models are being set up on the GPU. */
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "speaking"; speaking: boolean }
  /** `start` and `end` are seconds from when listening started. */
  | { type: "transcript"; text: string; start: number; end: number; latencyMs: number }
  /** A segment Whisper transcribed but the hallucination filter dropped. */
  | { type: "dropped"; text: string; reason: string; start: number; end: number }
  | { type: "error"; message: string };

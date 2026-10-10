// Speech-to-text comparison for the evaluation page (experiment E11):
// Whisper, loaded as the app loads it, against Gemma 4 with its audio
// encoder. Clips are 16 kHz mono WAV with known text; music can be mixed in
// underneath at a chosen signal-to-noise ratio. Driven by
// experiments/e11/stt-eval.mjs.

import "../ml-env.js";
import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { LlmClient } from "../llm/llm-client.js";
import { SAMPLE_RATE } from "../stt/segmenter.js";

export type SttModel = { kind: "whisper"; model: string } | { kind: "gemma"; repo: string; dtype?: string };

export interface Clip {
  name: string;
  url: string;
  text: string;
}

export interface SttResult {
  name: string;
  reference: string;
  transcript: string;
  ms: number;
  seconds: number;
}

declare global {
  interface Window {
    sttLoad: (model: SttModel) => Promise<{ ms: number }>;
    sttRun: (options: { clips: Clip[]; music?: { url: string; snrDb: number } }) => Promise<SttResult[]>;
  }
}

/** The instruction from the Gemma 4 model card for speech recognition. */
export const GEMMA_ASR_INSTRUCTION =
  "Transcribe the following speech segment in English into English text.\n\n" +
  "Follow these specific instructions for formatting the answer:\n" +
  "* Only output the transcription, with no newlines.\n" +
  "* When transcribing numbers, write the digits, i.e. write 1.7 and not one point seven, and write 3 instead of three.";

let transcribe: ((audio: Float32Array) => Promise<string>) | undefined;
let gemma: LlmClient | undefined;

window.sttLoad = async (m) => {
  const started = performance.now();
  gemma?.terminate();
  gemma = undefined;
  if (m.kind === "whisper") {
    // As src/stt/worker.ts loads it.
    const asr = (await pipeline("automatic-speech-recognition", `onnx-community/whisper-${m.model}`, {
      device: "webgpu",
      dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
    })) as AutomaticSpeechRecognitionPipeline;
    await asr(new Float32Array(SAMPLE_RATE)); // Compile shaders before timing anything.
    transcribe = async (audio) => {
      const r = await asr(audio);
      return ((Array.isArray(r) ? r[0]?.text : r.text) ?? "").trim();
    };
  } else {
    const client = (gemma = new LlmClient());
    await client.load({ repo: m.repo, audio: true, ...(m.dtype ? { dtype: m.dtype } : {}) });
    await client.transcribe(new Float32Array(SAMPLE_RATE), GEMMA_ASR_INSTRUCTION, 8);
    transcribe = (audio) => client.transcribe(audio, GEMMA_ASR_INSTRUCTION);
  }
  return { ms: performance.now() - started };
};

/** 16-bit PCM WAV to floats (the clips are made 16 kHz mono). */
function decodeWav(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  let offset = 12;
  while (offset < view.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      const samples = new Int16Array(buffer.slice(offset + 8, offset + 8 + size));
      return Float32Array.from(samples, (x) => x / 32768);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in WAV");
}

/** Decodes any audio the browser can play to 16 kHz mono. */
async function decodeTo16k(buffer: ArrayBuffer): Promise<Float32Array> {
  const decoded = await new AudioContext().decodeAudioData(buffer);
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));

window.sttRun = async ({ clips, music }) => {
  const bed = music ? await decodeTo16k(await (await fetch(music.url)).arrayBuffer()) : undefined;
  const results: SttResult[] = [];
  for (const [n, clip] of clips.entries()) {
    const speech = decodeWav(await (await fetch(clip.url)).arrayBuffer());
    let audio = speech;
    if (bed && music) {
      // A different stretch of the music for each clip, scaled to the target signal-to-noise ratio.
      const start = (n * 7 * SAMPLE_RATE) % Math.max(1, bed.length - speech.length);
      const stretch = bed.subarray(start, start + speech.length);
      const gain = rms(speech) / (Math.max(rms(stretch), 1e-6) * 10 ** (music.snrDb / 20));
      audio = speech.map((s, i) => Math.max(-1, Math.min(1, s + gain * (stretch[i] ?? 0))));
    }
    const started = performance.now();
    const transcript = await transcribe!(audio);
    results.push({ name: clip.name, reference: clip.text, transcript, ms: performance.now() - started, seconds: audio.length / SAMPLE_RATE });
  }
  return results;
};

// Speech-to-text worker: Silero VAD finds speech in the incoming audio, and
// Whisper (WebGPU) transcribes each segment. See DESIGN.md 7.2.

import "../ml-env.js";
import { AutoModel, pipeline, Tensor } from "@huggingface/transformers";
import type { AutomaticSpeechRecognitionPipeline, PreTrainedModel } from "@huggingface/transformers";
import { hallucinationReason } from "./hallucination.js";
import type { FromWorker, ToWorker, WhisperModel } from "./protocol.js";
import { SAMPLE_RATE, Segmenter, type Segment } from "./segmenter.js";

const post = (message: FromWorker) => self.postMessage(message);

let vad: PreTrainedModel | undefined;
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
const sr = new Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);
let vadState = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
let segmenter = new Segmenter();

async function load(model: WhisperModel): Promise<void> {
  // Combine per-file progress into one overall figure.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== "progress" || !info.file) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({ type: "progress", loaded, total });
  };

  vad = await AutoModel.from_pretrained("onnx-community/silero-vad", {
    // Silero isn't a model architecture transformers.js knows by name.
    config: { model_type: "custom" } as never,
    dtype: "fp32",
    progress_callback,
  });
  transcriber = (await pipeline("automatic-speech-recognition", `onnx-community/whisper-${model}`, {
    device: "webgpu",
    dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
    progress_callback,
  })) as AutomaticSpeechRecognitionPipeline;
  post({ type: "preparing" });
  // Run once on silence so WebGPU compiles its shaders before real audio arrives.
  await transcriber(new Float32Array(SAMPLE_RATE));
  post({ type: "ready" });
}

async function speechProbability(frame: Float32Array): Promise<number> {
  const input = new Tensor("float32", frame, [1, frame.length]);
  const { output, stateN } = (await vad!({ input, sr, state: vadState })) as { output: Tensor; stateN: Tensor };
  vadState = stateN;
  return (output.data as Float32Array)[0]!;
}

async function transcribe(segment: Segment): Promise<void> {
  const started = performance.now();
  const result = await transcriber!(segment.audio);
  const text = (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? "";
  const reason = hallucinationReason(text);
  if (reason) post({ type: "dropped", text, reason, start: segment.start, end: segment.end });
  else post({ type: "transcript", text, start: segment.start, end: segment.end, latencyMs: performance.now() - started });
}

async function audio(frame: Float32Array): Promise<void> {
  if (!vad || !transcriber) return;
  const wasSpeaking = segmenter.speaking;
  const segment = segmenter.push(frame, await speechProbability(frame));
  if (segmenter.speaking !== wasSpeaking) post({ type: "speaking", speaking: segmenter.speaking });
  // Transcribe in the background so frames keep flowing through the VAD.
  if (segment) void transcribe(segment).catch(report);
}

async function flush(): Promise<void> {
  const segment = segmenter.flush();
  segmenter = new Segmenter();
  vadState = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
  post({ type: "speaking", speaking: false });
  if (segment) await transcribe(segment);
}

function report(err: unknown): void {
  post({ type: "error", message: err instanceof Error ? err.message : String(err) });
}

// Handle messages strictly in order: each frame's VAD state depends on the last.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  queue = queue
    .then(() => {
      switch (message.type) {
        case "load":
          return load(message.model);
        case "audio":
          return audio(message.samples);
        case "flush":
          return flush();
      }
    })
    .catch(report);
};

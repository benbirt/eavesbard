// Messages between the page and the LLM worker, and the model the app uses
// (experiment E9).

/** The LLM blended with the embeddings in local scene checks (experiments/E9.md). */
export const SCENE_LLM = {
  name: "Gemma 4 E2B",
  repo: "onnx-community/gemma-4-E2B-it-ONNX",
  /** Text only, 4-bit with 16-bit activations; GPUs without 16-bit floats need about 3.6 GB. */
  downloadMb: 3110,
};

/** What the worker needs to load a model. */
export interface LlmLoad {
  repo: string;
  /** For models (e.g. Qwen3) that think aloud unless the answer starts with an empty thought. */
  emptyThought?: boolean;
  /** Overrides the choice between q4f16 and q4 (for experiments). */
  dtype?: string;
  /** Where to load the tokenizer from, if not `repo` (some builds ship without a chat template). */
  tokenizerRepo?: string;
  /** Load the audio encoder too, so the model can transcribe (Gemma 4 E2B/E4B; experiment E11). */
  audio?: boolean;
}

export type ToLlmWorker =
  | { type: "load"; model: LlmLoad }
  /**
   * Score labels as the continuation of a one-message chat. The answer
   * starts with `prefill`; each label lists its spellings (e.g. " dungeon",
   * " Dungeon"), whose probabilities are added.
   */
  | { type: "ask"; requestId: number; content: string; prefill: string; spellings: string[][] }
  /** Free text, for checking what the model would write unprompted. */
  | { type: "generate"; requestId: number; content: string; maxTokens: number }
  /** Speech to text: 16 kHz mono audio (at most 30 s), with an instruction. Needs `audio` at load. */
  | { type: "transcribe"; requestId: number; audio: Float32Array; instruction: string; maxTokens: number };

export type FromLlmWorker =
  | { type: "progress"; loaded: number; total: number }
  /** Downloads are done; the model is being set up on the GPU. */
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "answer"; requestId: number; probs: number[]; ms: number }
  | { type: "text"; requestId: number; text: string; ms: number }
  | { type: "error"; message: string; requestId?: number };

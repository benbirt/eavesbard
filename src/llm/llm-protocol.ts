// Messages between the page and the scene LLM worker, and the models on offer
// (experiment E9, approach C).

export const SCENE_LLMS = {
  "gemma-4-e2b": {
    name: "Gemma 4 E2B",
    repo: "onnx-community/gemma-4-E2B-it-ONNX",
    /** Text only, 4-bit with 16-bit activations; GPUs without 16-bit floats need about 3.6 GB. */
    downloadMb: 3110,
    /** Some models (Qwen3) think aloud unless the answer starts with an empty thought. */
    emptyThought: false,
  },
  // Gemma 3 4B was dropped: with 16-bit activations its numbers overflow
  // (NaN) on Apple GPUs, and Gemma 4 E2B scores better (experiments/E9.md).
  // Qwen3 1.7B's single-file build is too big for ONNX Runtime Web to load.
} as const;
export type SceneLlm = keyof typeof SCENE_LLMS;
export const SCENE_LLM_IDS = Object.keys(SCENE_LLMS) as SceneLlm[];

/** What the worker needs to load a model. */
export interface LlmLoad {
  repo: string;
  /** Some models (Qwen3) think aloud unless the answer starts with an empty thought. */
  emptyThought: boolean;
  /** Overrides the choice between q4f16 and q4 (for experiments). */
  dtype?: string;
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
  | { type: "generate"; requestId: number; content: string; maxTokens: number };

export type FromLlmWorker =
  | { type: "progress"; loaded: number; total: number }
  /** Downloads are done; the model is being set up on the GPU. */
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "answer"; requestId: number; probs: number[]; ms: number }
  | { type: "text"; requestId: number; text: string; ms: number }
  | { type: "error"; message: string; requestId?: number };

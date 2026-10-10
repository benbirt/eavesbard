// Messages between the page and the scene LLM worker, and the models on offer
// (experiment E9, approach C).

export const SCENE_LLMS = {
  "gemma-3-4b": {
    name: "Gemma 3 4B",
    repo: "onnx-community/gemma-3-4b-it-ONNX",
    /** The 4-bit download with 16-bit activations; GPUs without 16-bit floats need about 3.2 GB. */
    downloadMb: 2770,
    /** Some models (Qwen3) think aloud unless the answer starts with an empty thought. */
    emptyThought: false,
  },
  // Qwen3 1.7B scored nearly as well at half the download, but onnx-community's
  // build is one 1.4 GB file, which ONNX Runtime Web can't load within its
  // memory limit. A copy with the weights in a separate file loads (see
  // experiments/E9.md); it can come back once one is hosted.
} as const;
export type SceneLlm = keyof typeof SCENE_LLMS;
export const SCENE_LLM_IDS = Object.keys(SCENE_LLMS) as SceneLlm[];

export type ToLlmWorker =
  | { type: "load"; model: SceneLlm }
  /** Score `labels` as answers to a one-message chat. */
  | { type: "ask"; requestId: number; content: string; labels: string[] };

export type FromLlmWorker =
  | { type: "progress"; loaded: number; total: number }
  /** Downloads are done; the model is being set up on the GPU. */
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "answer"; requestId: number; probs: number[]; ms: number }
  | { type: "error"; message: string; requestId?: number };

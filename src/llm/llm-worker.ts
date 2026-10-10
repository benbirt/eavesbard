// The scene LLM (experiment E9, approach C): a small instruction model on
// WebGPU scores each label as the answer to a question about the scene.
// Nothing is generated: one forward pass gives the next-token probabilities,
// read for each label's first token (" dungeon", " Dungeon").

import "../ml-env.js";
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Tensor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { ANSWER_PREFIX, labelProbabilities } from "../classify/llm-prompt.js";
import { SCENE_LLMS, type FromLlmWorker, type SceneLlm, type ToLlmWorker } from "./llm-protocol.js";

const post = (message: FromLlmWorker) => self.postMessage(message);

let tokenizer: PreTrainedTokenizer | undefined;
let model: PreTrainedModel | undefined;
let emptyThought = false;

async function load(id: SceneLlm): Promise<void> {
  const spec = SCENE_LLMS[id];
  emptyThought = spec.emptyThought;
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
  tokenizer = await AutoTokenizer.from_pretrained(spec.repo, { progress_callback });
  model = await AutoModelForCausalLM.from_pretrained(spec.repo, {
    device: "webgpu",
    // 16-bit activations halve the download, but not every GPU can do 16-bit floats.
    dtype: (await hasShaderF16()) ? "q4f16" : "q4",
    progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
      progress_callback(info);
      if (info.status === "done" && info.file?.includes("onnx")) post({ type: "preparing" });
    },
  });
  post({ type: "ready" });
}

async function hasShaderF16(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  if (!adapter) throw new Error("no WebGPU adapter");
  return adapter.features.has("shader-f16");
}

const encode = (text: string) => tokenizer!.encode(text, { add_special_tokens: false });

/** Log-softmax of one row of logits, at the given token ids. */
function logProbs(row: Float32Array, ids: number[]): number[] {
  let max = -Infinity;
  for (const x of row) if (x > max) max = x;
  let sum = 0;
  for (const x of row) sum += Math.exp(x - max);
  const logZ = max + Math.log(sum);
  return ids.map((id) => row[id]! - logZ);
}

/** Logits for every position, as float32 rows. */
async function forward(text: string, lastOnly: boolean): Promise<{ rows: number; vocab: number; data: Float32Array }> {
  const inputs = tokenizer!(text, { add_special_tokens: false }) as Record<string, Tensor>;
  // Models that support it return only the last position's logits, saving a big copy.
  if (lastOnly) inputs.num_logits_to_keep = new Tensor("int64", [1n], []);
  const { logits } = (await model!(inputs)) as { logits: Tensor };
  const [, rows, vocab] = logits.dims as [number, number, number];
  return { rows, vocab, data: logits.to("float32").data as Float32Array };
}

async function ask(requestId: number, content: string, labels: string[]): Promise<void> {
  const started = performance.now();
  let prompt = tokenizer!.apply_chat_template([{ role: "user", content }], {
    tokenize: false,
    add_generation_prompt: true,
  }) as string;
  if (emptyThought) prompt += "<think>\n\n</think>\n\n";
  prompt += ANSWER_PREFIX;
  const base = encode(prompt).length;
  const capitalised = (l: string) => l[0]!.toUpperCase() + l.slice(1);

  // Fast path: one pass, when every spelling of every label starts with its own token.
  const firsts = labels.map((l) => [...new Set([` ${l}`, ` ${capitalised(l)}`].map((w) => encode(prompt + w)[base]!))]);
  const all = firsts.flat();
  let probs: number[];
  if (new Set(all).size === all.length) {
    const lastOnly = Boolean(model!.sessions["decoder_model_merged"]?.inputNames.includes("num_logits_to_keep"));
    const { rows, vocab, data } = await forward(prompt, lastOnly);
    const row = data.subarray((rows - 1) * vocab, rows * vocab);
    probs = labelProbabilities(firsts.map((ids) => logProbs(row, ids)));
  } else {
    // Otherwise score each label's whole spelling, one pass per label.
    const scores: number[][] = [];
    for (const label of labels) {
      const text = `${prompt} ${label}`;
      const ids = encode(text);
      const { vocab, data } = await forward(text, false);
      let total = 0;
      for (let t = base; t < ids.length; t++) {
        total += logProbs(data.subarray((t - 1) * vocab, t * vocab), [ids[t]!])[0]!;
      }
      scores.push([total]);
    }
    probs = labelProbabilities(scores);
  }
  post({ type: "answer", requestId, probs, ms: performance.now() - started });
}

// One request at a time, in order.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ToLlmWorker>) => {
  const m = event.data;
  queue = queue
    .then(() => (m.type === "load" ? load(m.model) : ask(m.requestId, m.content, m.labels)))
    .catch((err: unknown) =>
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        requestId: m.type === "ask" ? m.requestId : undefined,
      }),
    );
};

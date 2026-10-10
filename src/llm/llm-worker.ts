// The scene LLM (experiment E9, approach C): a small instruction model on
// WebGPU scores each label as the answer to a question about the scene.
// Nothing is generated: the answer is prefilled up to the label, and one
// forward pass gives the next-token probabilities, read for each spelling's
// first token (" dungeon", " Dungeon").

import "../ml-env.js";
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Tensor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { labelProbabilities } from "../classify/llm-prompt.js";
import { gpuAdapter } from "../gpu.js";
import type { FromLlmWorker, LlmLoad, ToLlmWorker } from "./llm-protocol.js";

const post = (message: FromLlmWorker) => self.postMessage(message);

let tokenizer: PreTrainedTokenizer | undefined;
let model: PreTrainedModel | undefined;
let emptyThought = false;

async function load(spec: LlmLoad): Promise<void> {
  emptyThought = spec.emptyThought ?? false;
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
    dtype: (spec.dtype ?? ((await hasShaderF16()) ? "q4f16" : "q4")) as "q4",
    progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
      progress_callback(info);
      if (info.status === "done" && info.file?.includes("onnx")) post({ type: "preparing" });
    },
  });
  post({ type: "ready" });
}

async function hasShaderF16(): Promise<boolean> {
  const adapter = await gpuAdapter();
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

function chatPrompt(content: string): string {
  const prompt = tokenizer!.apply_chat_template([{ role: "user", content }], {
    tokenize: false,
    add_generation_prompt: true,
  }) as string;
  return emptyThought ? `${prompt}<think>\n\n</think>\n\n` : prompt;
}

async function ask(requestId: number, content: string, prefill: string, spellings: string[][]): Promise<void> {
  const started = performance.now();
  const prompt = chatPrompt(content) + prefill;
  const base = encode(prompt).length;

  // Fast path: one pass, when every spelling of every label starts with its own token.
  const firsts = spellings.map((ss) => [...new Set(ss.map((w) => encode(prompt + w)[base]!))]);
  const all = firsts.flat();
  let probs: number[];
  if (new Set(all).size === all.length) {
    const lastOnly = Boolean(model!.sessions["decoder_model_merged"]?.inputNames.includes("num_logits_to_keep"));
    const { rows, vocab, data } = await forward(prompt, lastOnly);
    const row = data.subarray((rows - 1) * vocab, rows * vocab);
    probs = labelProbabilities(firsts.map((ids) => logProbs(row, ids)));
  } else {
    // Otherwise score each label's first spelling in full, one pass per label.
    const scores: number[][] = [];
    for (const [spelling] of spellings) {
      const text = prompt + spelling!;
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

async function generate(requestId: number, content: string, maxTokens: number): Promise<void> {
  const started = performance.now();
  const inputs = tokenizer!(chatPrompt(content), { add_special_tokens: false }) as Record<string, Tensor>;
  const output = (await model!.generate({ ...inputs, max_new_tokens: maxTokens, do_sample: false })) as Tensor;
  const ids = Array.from(output.data as BigInt64Array, Number).slice(inputs.input_ids!.dims[1]);
  post({ type: "text", requestId, text: tokenizer!.decode(ids, { skip_special_tokens: true }), ms: performance.now() - started });
}

// One request at a time, in order.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ToLlmWorker>) => {
  const m = event.data;
  queue = queue
    .then(() => {
      switch (m.type) {
        case "load":
          return load(m.model);
        case "ask":
          return ask(m.requestId, m.content, m.prefill, m.spellings);
        case "generate":
          return generate(m.requestId, m.content, m.maxTokens);
      }
    })
    .catch((err: unknown) =>
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        requestId: m.type === "load" ? undefined : m.requestId,
      }),
    );
};

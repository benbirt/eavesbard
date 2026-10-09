// Local track search (DESIGN.md 7.7): a small sentence-embedding model turns
// each track's description into a vector once, then ranks tracks by
// similarity to a query. Runs on the CPU so it doesn't compete with Whisper
// for the GPU.

import "../ml-env.js";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL, type FromEmbedWorker, type ToEmbedWorker } from "./embed-protocol.js";

const post = (message: FromEmbedWorker) => self.postMessage(message);

// BGE models expect this prefix on queries (not on the documents searched).
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

let extractor: FeatureExtractionPipeline | undefined;
const vectors = new Map<number, Float32Array>();

async function load(): Promise<void> {
  const files = new Map<string, { loaded: number; total: number }>();
  extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL, {
    device: "wasm",
    dtype: "q8",
    progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress" || !info.file) return;
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: "progress", loaded, total });
    },
  })) as FeatureExtractionPipeline;
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  const output = await extractor!(texts, { pooling: "cls", normalize: true });
  const [rows, dims] = output.dims as [number, number];
  const data = output.data as Float32Array;
  return Array.from({ length: rows }, (_, i) => data.slice(i * dims, (i + 1) * dims));
}

async function index(docs: { id: number; text: string }[]): Promise<void> {
  const started = performance.now();
  for (let i = 0; i < docs.length; i += 16) {
    const batch = docs.slice(i, i + 16);
    const embedded = await embed(batch.map((d) => d.text));
    batch.forEach((d, j) => vectors.set(d.id, embedded[j]!));
  }
  post({ type: "indexed", count: vectors.size, ms: performance.now() - started });
}

async function query(requestId: number, text: string, candidates?: number[]): Promise<void> {
  const started = performance.now();
  const [q] = await embed([QUERY_PREFIX + text]);
  const ids = candidates ?? [...vectors.keys()];
  const ranked = ids
    .map((id) => {
      const v = vectors.get(id);
      let score = 0;
      if (v) for (let k = 0; k < v.length; k++) score += v[k]! * q![k]!;
      return { id, score };
    })
    .sort((a, b) => b.score - a.score);
  post({ type: "ranked", requestId, ranked, ms: performance.now() - started });
}

// Handle messages in order: queries need the index built first.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ToEmbedWorker>) => {
  const m = event.data;
  queue = queue
    .then(() => {
      switch (m.type) {
        case "load":
          return load();
        case "index":
          return index(m.docs);
        case "query":
          return query(m.requestId, m.text, m.candidates);
      }
    })
    .catch((err: unknown) =>
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        requestId: m.type === "query" ? m.requestId : undefined,
      }),
    );
};

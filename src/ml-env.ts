// transformers.js settings shared by the workers: serve ONNX Runtime's
// WebAssembly from our own site (./ort/), not a CDN, and only load models
// from the Hugging Face hub.

import { env } from "@huggingface/transformers";
import { resumableFetch, setDownloadsPaused } from "./llm/resumable-fetch.js";

env.backends.onnx.wasm!.wasmPaths = {
  mjs: new URL("./ort/ort-wasm-simd-threaded.asyncify.mjs", self.location.href).href,
  wasm: new URL("./ort/ort-wasm-simd-threaded.asyncify.wasm", self.location.href).href,
};
env.allowLocalModels = false;

// Model files download in saved pieces, so they can be paused and resumed
// (src/llm/resumable-fetch.ts). The page pauses every worker's downloads
// with a { type: "downloads", paused } message, handled here at once rather
// than behind the worker's queue (a load can take minutes).
env.fetch = resumableFetch;
self.addEventListener("message", (e: MessageEvent<unknown>) => {
  const m = e.data as { type?: string; paused?: boolean };
  if (m?.type === "downloads") setDownloadsPaused(Boolean(m.paused));
});

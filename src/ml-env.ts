// transformers.js settings shared by the workers: serve ONNX Runtime's
// WebAssembly from our own site (./ort/), not a CDN, and only load models
// from the Hugging Face hub.

import { env } from "@huggingface/transformers";

env.backends.onnx.wasm!.wasmPaths = {
  mjs: new URL("./ort/ort-wasm-simd-threaded.asyncify.mjs", self.location.href).href,
  wasm: new URL("./ort/ort-wasm-simd-threaded.asyncify.wasm", self.location.href).href,
};
env.allowLocalModels = false;

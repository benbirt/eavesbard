// The page's handle on one LLM worker: load a model, then score labels or
// generate text. Used by the app (scene-llm.ts) and the evaluation page.

import { assetUrl } from "../assets.js";
import type { FromLlmWorker, LlmLoad, ToLlmWorker } from "./llm-protocol.js";

export interface LoadProgress {
  loaded: number;
  total: number;
  /** Downloads are done and the model is being set up on the GPU. */
  preparing: boolean;
}

type Waiting = { resolve: (value: number[] | string) => void; reject: (e: Error) => void };

export class LlmClient {
  private readonly worker: Worker;
  private nextRequest = 0;
  private readonly waiting = new Map<number, Waiting>();
  private loadDone?: { resolve: () => void; reject: (e: Error) => void };
  private onProgress?: (p: LoadProgress) => void;

  constructor() {
    this.worker = new Worker(assetUrl("llm-worker.js"), { type: "module" });
    this.worker.onerror = (e) => this.failAll(e.message || "The LLM worker failed to start");
    this.worker.onmessage = (e: MessageEvent<FromLlmWorker>) => this.receive(e.data);
  }

  /** Downloads (or loads from cache) and prepares a model. */
  load(model: LlmLoad, onProgress?: (p: LoadProgress) => void): Promise<void> {
    this.onProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.loadDone = { resolve, reject };
      this.send({ type: "load", model });
    });
  }

  /** Probabilities of each label (given as its spellings) after `prefill`. */
  ask(content: string, prefill: string, spellings: string[][]): Promise<number[]> {
    return this.request((requestId) => ({ type: "ask", requestId, content, prefill, spellings })) as Promise<number[]>;
  }

  /** Speech to text (16 kHz mono, at most 30 s); the model must be loaded with `audio`. */
  transcribe(audio: Float32Array, instruction: string, maxTokens = 128): Promise<string> {
    return this.request((requestId) => ({ type: "transcribe", requestId, audio, instruction, maxTokens })) as Promise<string>;
  }

  /** What the model writes, greedily, up to `maxTokens`. */
  generate(content: string, maxTokens: number): Promise<string> {
    return this.request((requestId) => ({ type: "generate", requestId, content, maxTokens })) as Promise<string>;
  }

  terminate(): void {
    this.worker.terminate();
    this.failAll("the model was switched off");
  }

  private request(make: (requestId: number) => ToLlmWorker): Promise<number[] | string> {
    const requestId = this.nextRequest++;
    return new Promise((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject });
      this.send(make(requestId));
    });
  }

  private send(message: ToLlmWorker): void {
    this.worker.postMessage(message);
  }

  private settle(requestId: number, how: (w: Waiting) => void): void {
    const w = this.waiting.get(requestId);
    this.waiting.delete(requestId);
    if (w) how(w);
  }

  private failAll(message: string): void {
    this.loadDone?.reject(new Error(message));
    this.loadDone = undefined;
    for (const w of this.waiting.values()) w.reject(new Error(message));
    this.waiting.clear();
  }

  private receive(m: FromLlmWorker): void {
    switch (m.type) {
      case "progress":
        // "preparing" can come between files; more progress means it's still downloading.
        this.onProgress?.({ loaded: m.loaded, total: m.total, preparing: false });
        break;
      case "preparing":
        this.onProgress?.({ loaded: 0, total: 0, preparing: true });
        break;
      case "ready":
        this.loadDone?.resolve();
        this.loadDone = undefined;
        break;
      case "answer":
        this.settle(m.requestId, (w) => w.resolve(m.probs));
        break;
      case "text":
        this.settle(m.requestId, (w) => w.resolve(m.text));
        break;
      case "error":
        if (m.requestId === undefined) this.failAll(m.message);
        else this.settle(m.requestId, (w) => w.reject(new Error(m.message)));
        break;
    }
  }
}

// The page's side of the embedding worker: one shared model and index for
// local track search and local scene classification (DESIGN.md 7.5, 7.7).

import { signal } from "@preact/signals";
import { assetUrl } from "../assets.js";
import type { FromEmbedWorker, ToEmbedWorker } from "./embed-protocol.js";

export type LocalModelState =
  | { phase: "off" }
  | { phase: "loading"; loaded: number; total: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export const localModel = signal<LocalModelState>({ phase: "off" });

let worker: Worker | undefined;
let loaded: Promise<void> | undefined;
let nextRequest = 0;
const waiting = new Map<number, { resolve: (r: { key: string; score: number }[]) => void; reject: (e: Error) => void }>();
let indexDone: (() => void) | undefined;

function send(message: ToEmbedWorker): void {
  worker!.postMessage(message);
}

/** Starts the worker and indexes `docs`, once. Safe to call repeatedly. */
export function prepareEmbeddings(docs: () => { key: string; text: string }[]): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    localModel.value = { phase: "loading", loaded: 0, total: 0 };
    worker = new Worker(assetUrl("embed-worker.js"), { type: "module" });
    const fail = (message: string) => {
      localModel.value = { phase: "error", message };
      loaded = undefined;
      worker?.terminate();
      worker = undefined;
      reject(new Error(message));
    };
    indexDone = () => {
      localModel.value = { phase: "ready" };
      resolve();
    };
    worker.onerror = (e) => fail(e.message || "The local model's worker failed to start");
    worker.onmessage = (e: MessageEvent<FromEmbedWorker>) => {
      const m = e.data;
      switch (m.type) {
        case "progress":
          localModel.value = { phase: "loading", loaded: m.loaded, total: m.total };
          break;
        case "indexed":
          indexDone?.();
          break;
        case "ranked":
          waiting.get(m.requestId)?.resolve(m.ranked);
          waiting.delete(m.requestId);
          break;
        case "error":
          if (m.requestId !== undefined) {
            waiting.get(m.requestId)?.reject(new Error(m.message));
            waiting.delete(m.requestId);
          } else {
            fail(`Local model: ${m.message}`);
          }
          break;
      }
    };
    send({ type: "load" });
    send({ type: "index", docs: docs() });
  });
  return loaded;
}

/** Ranks `candidates` by similarity to `text` (the index must be prepared). */
export function rank(text: string, candidates: string[]): Promise<{ key: string; score: number }[]> {
  const requestId = nextRequest++;
  return new Promise((resolve, reject) => {
    waiting.set(requestId, { resolve, reject });
    send({ type: "query", requestId, text, candidates });
  });
}

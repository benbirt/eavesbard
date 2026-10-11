// The page's side of the embedding worker: one shared model and index for
// local track search and local scene classification (DESIGN.md 7.5, 7.7).

import { signal } from "@preact/signals";
import { assetUrl } from "../assets.js";
import { markDownloaded } from "../downloads.js";
import { EMBEDDING_MODEL, type FromEmbedWorker, type ToEmbedWorker } from "./embed-protocol.js";

export type LocalModelState =
  | { phase: "off" }
  | { phase: "loading"; loaded: number; total: number }
  /** Scene checks can run; track picks wait for the rest of the index. */
  | { phase: "indexing"; done: number; total: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export const localModel = signal<LocalModelState>({ phase: "off" });

type Doc = { key: string; text: string };

let worker: Worker | undefined;
let prepared: { first: Promise<void>; all: Promise<void> } | undefined;
let nextRequest = 0;
const waiting = new Map<number, { resolve: (r: { key: string; score: number }[]) => void; reject: (e: Error) => void }>();
/** One per "index" message sent, answered in order. */
const indexing: (() => void)[] = [];

/** How many documents to index per message, so queries can run in between. */
const BATCH = 32;

function send(message: ToEmbedWorker): void {
  worker!.postMessage(message);
}

function indexDocs(docs: Doc[]): Promise<void> {
  return new Promise((resolve) => {
    indexing.push(resolve);
    send({ type: "index", docs });
  });
}

/**
 * Starts the worker, once, and indexes `first` (what scene checks need),
 * then `rest` (the tracks) a batch at a time, so queries can run in between
 * batches rather than waiting for the whole index. Safe to call repeatedly.
 */
export function prepareEmbeddings(first: () => Doc[], rest: () => Doc[]): { first: Promise<void>; all: Promise<void> } {
  if (prepared) return prepared;
  let failed: (e: Error) => void = () => undefined;
  const failure = new Promise<never>((_, reject) => (failed = reject));
  failure.catch(() => undefined);
  localModel.value = { phase: "loading", loaded: 0, total: 0 };
  worker = new Worker(assetUrl("embed-worker.js"), { type: "module" });
  const fail = (message: string) => {
    localModel.value = { phase: "error", message };
    prepared = undefined;
    worker?.terminate();
    worker = undefined;
    failed(new Error(message));
  };
  worker.onerror = (e) => fail(e.message || "The local model's worker failed to start");
  worker.onmessage = (e: MessageEvent<FromEmbedWorker>) => {
    const m = e.data;
    switch (m.type) {
      case "progress":
        if (localModel.value.phase === "loading") localModel.value = { phase: "loading", loaded: m.loaded, total: m.total };
        break;
      case "indexed":
        indexing.shift()?.();
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
  const firstDone = indexDocs(first()).then(() => {
    markDownloaded(EMBEDDING_MODEL);
    localModel.value = { phase: "indexing", done: 0, total: rest().length };
  });
  const allDone = firstDone.then(async () => {
    const docs = rest();
    for (let i = 0; i < docs.length; i += BATCH) {
      await indexDocs(docs.slice(i, i + BATCH));
      localModel.value = { phase: "indexing", done: Math.min(i + BATCH, docs.length), total: docs.length };
    }
    localModel.value = { phase: "ready" };
  });
  prepared = { first: Promise.race([firstDone, failure]), all: Promise.race([allDone, failure]) };
  return prepared;
}

/** Ranks `candidates` by similarity to `text` (the index must be prepared). */
export function rank(text: string, candidates: string[]): Promise<{ key: string; score: number }[]> {
  const requestId = nextRequest++;
  return new Promise((resolve, reject) => {
    waiting.set(requestId, { resolve, reject });
    send({ type: "query", requestId, text, candidates });
  });
}

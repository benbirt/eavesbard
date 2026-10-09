// The local track chooser (DESIGN.md 7.7): embedding search over the track
// list, run in a worker on this computer. No API key needed.

import { signal } from "@preact/signals";
import { assetUrl } from "../assets.js";
import type { LibraryTrack } from "../library/tag-map.js";
import { searchText } from "../library/track-text.js";
import type { FromEmbedWorker, ToEmbedWorker } from "./embed-protocol.js";
import type { PickRequest } from "./request.js";

export type LocalSearchState =
  | { phase: "off" }
  | { phase: "loading"; loaded: number; total: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export const localSearch = signal<LocalSearchState>({ phase: "off" });

let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let nextRequest = 0;
const pending = new Map<number, { resolve: (r: { id: number; score: number }[]) => void; reject: (e: Error) => void }>();

/** Starts the model and indexes `tracks`, once. Safe to call repeatedly. */
export function prepareLocalSearch(tracks: readonly LibraryTrack[]): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    localSearch.value = { phase: "loading", loaded: 0, total: 0 };
    worker = new Worker(assetUrl("embed-worker.js"), { type: "module" });
    const fail = (message: string) => {
      localSearch.value = { phase: "error", message };
      ready = undefined;
      worker?.terminate();
      worker = undefined;
      reject(new Error(message));
    };
    worker.onerror = (e) => fail(e.message || "The local search worker failed to start");
    worker.onmessage = (e: MessageEvent<FromEmbedWorker>) => {
      const m = e.data;
      switch (m.type) {
        case "progress":
          localSearch.value = { phase: "loading", loaded: m.loaded, total: m.total };
          break;
        case "indexed":
          localSearch.value = { phase: "ready" };
          resolve();
          break;
        case "ranked":
          pending.get(m.requestId)?.resolve(m.ranked);
          pending.delete(m.requestId);
          break;
        case "error":
          if (m.requestId !== undefined) {
            pending.get(m.requestId)?.reject(new Error(m.message));
            pending.delete(m.requestId);
          } else {
            fail(`Local search: ${m.message}`);
          }
          break;
      }
    };
    const send = (message: ToEmbedWorker) => worker!.postMessage(message);
    send({ type: "load" });
    send({ type: "index", docs: tracks.map((t) => ({ id: t.track.id, text: searchText(t) })) });
  });
  return ready;
}

/** What to search for: the description or the latest transcript, plus the scene. */
export function localQuery(request: PickRequest): string {
  const context = request.description ?? request.transcript.slice(-6).join(" ");
  return `${request.scene.setting}, ${request.scene.intensity}. ${context}`.trim();
}

export interface LocalPick {
  entry: LibraryTrack;
  score: number;
  query: string;
}

/** Ranks the allowed `choices` against the request and returns the best. */
export async function localPick(
  request: PickRequest,
  choices: readonly LibraryTrack[],
  tracks: readonly LibraryTrack[],
): Promise<LocalPick> {
  await prepareLocalSearch(tracks);
  const query = localQuery(request);
  const requestId = nextRequest++;
  const ranked = await new Promise<{ id: number; score: number }[]>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    worker!.postMessage({ type: "query", requestId, text: query, candidates: choices.map((c) => c.track.id) } satisfies ToEmbedWorker);
  });
  const best = ranked[0];
  const entry = best && choices.find((c) => c.track.id === best.id);
  if (!best || !entry) throw new Error("Local search found no track.");
  return { entry, score: best.score, query };
}

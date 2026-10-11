// Model downloads need the user's choice (DESIGN.md 7.10): a model loads by
// itself only when it's fully downloaded already. Anything else, including a
// half-finished download, waits until the user chooses to download, each
// visit (the start card's "Download now", or "Download … and begin").

import { signal } from "@preact/signals";
import { loadSetting, saveSetting } from "./settings.js";

/** Whether the user has chosen to download models, this visit. */
export const downloadsAllowed = signal(false);

const allowListeners: (() => void)[] = [];

/** The user chose to download: start the downloads waiting for it. */
export function allowDownloads(): void {
  if (downloadsAllowed.value) return;
  downloadsAllowed.value = true;
  for (const listener of allowListeners) listener();
}

/** Calls `listener` when the user chooses to download. */
export function onDownloadsAllowed(listener: () => void): void {
  allowListeners.push(listener);
}

/** Settings key recording that a model finished loading; kept by Reset to defaults. */
export const DOWNLOADED_PREFIX = "downloaded.";

/** Records that a model loaded completely, so its files are all in the browser. */
export function markDownloaded(repo: string): void {
  saveSetting(DOWNLOADED_PREFIX + repo, "yes");
  if (downloadedModels.value.get(repo) !== true) downloadedModels.value = new Map(downloadedModels.value).set(repo, true);
}

/** Whether transformers.js's cache holds any of a model's weights. */
async function inCache(repo: string): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    return keys.some((r) => r.url.includes(`/${repo}/`) && /\.onnx(_data(_\d+)?)?$/.test(new URL(r.url).pathname));
  } catch {
    return false;
  }
}

/** What isDownloaded has found, by model, for the UI; a missing entry means not checked yet. */
export const downloadedModels = signal<ReadonlyMap<string, boolean>>(new Map());

/**
 * Whether a model is fully downloaded: it finished loading here before, and
 * the browser still has its files (it may evict them to free space).
 */
export async function isDownloaded(repo: string): Promise<boolean> {
  const yes = loadSetting(DOWNLOADED_PREFIX + repo) === "yes" && (await inCache(repo));
  if (downloadedModels.value.get(repo) !== yes) downloadedModels.value = new Map(downloadedModels.value).set(repo, yes);
  return yes;
}

/**
 * For the UI: whether a model is fully downloaded, or undefined until known
 * (the first call starts the check).
 */
export function knownDownloaded(repo: string): boolean | undefined {
  const known = downloadedModels.value.get(repo);
  if (known === undefined) void isDownloaded(repo);
  return known;
}

/** Whether a model may load now: fully downloaded, or the user chose to download. */
export async function mayLoad(repo: string): Promise<boolean> {
  return downloadsAllowed.value || (await isDownloaded(repo));
}

/** Whether model downloads are paused. */
export const downloadsPaused = signal(false);

const workers = new Set<Worker>();

/** Bytes each model has received from the network (not read back from saved pieces), for its download speed. */
export const networkBytes = signal<ReadonlyMap<string, number>>(new Map());

/** A model worker (downloading `repo`) whose downloads Pause and Resume control. */
export function registerDownloader(worker: Worker, repo: string): void {
  workers.add(worker);
  if (downloadsPaused.value) worker.postMessage({ type: "downloads", paused: true });
  worker.addEventListener("message", (e: MessageEvent<{ type?: string; bytes?: number }>) => {
    if (e.data?.type === "network" && typeof e.data.bytes === "number") {
      networkBytes.value = new Map(networkBytes.value).set(repo, e.data.bytes);
    }
  });
}

export function unregisterDownloader(worker: Worker): void {
  workers.delete(worker);
}

/** Pauses or resumes every model download; a resumed download carries on from its last saved piece. */
export function setDownloadsPaused(paused: boolean): void {
  downloadsPaused.value = paused;
  for (const w of workers) w.postMessage({ type: "downloads", paused });
}

/** Bytes of each model already in the browser (finished files and saved pieces), for "… remaining". */
export const storedModelBytes = signal<ReadonlyMap<string, number>>(new Map());

/** The resumable fetch's piece size and store (src/llm/resumable-fetch.ts). */
const PIECE_BYTES = 16 * 1024 * 1024;

/**
 * Counts what's already stored of a model: whole files in transformers.js's
 * cache (their recorded sizes) and saved pieces of unfinished ones (16 MB
 * each, near enough). Updates storedModelBytes.
 */
export async function refreshStoredBytes(repo: string): Promise<void> {
  let bytes = 0;
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open("transformers-cache");
      for (const request of await cache.keys()) {
        if (!request.url.includes(`/${repo}/`)) continue;
        bytes += Number((await cache.match(request))?.headers.get("Content-Length") ?? 0) || 0;
      }
    }
  } catch {
    // No cache: nothing stored there.
  }
  bytes += (await savedPieces(repo)) * PIECE_BYTES;
  storedModelBytes.value = new Map(storedModelBytes.value).set(repo, bytes);
}

/** How many saved pieces of unfinished files there are for a model. */
function savedPieces(repo: string): Promise<number> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(0);
    const open = indexedDB.open("eavesbard-downloads", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("pieces");
    open.onerror = () => resolve(0);
    open.onsuccess = () => {
      const keys = open.result.transaction("pieces").objectStore("pieces").getAllKeys();
      keys.onsuccess = () => {
        resolve(keys.result.filter((k) => String(k).includes(`/${repo}/`)).length);
        open.result.close();
      };
      keys.onerror = () => resolve(0);
    };
  });
}

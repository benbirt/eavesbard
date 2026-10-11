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

/**
 * Whether a model is fully downloaded: it finished loading here before, and
 * the browser still has its files (it may evict them to free space).
 */
export async function isDownloaded(repo: string): Promise<boolean> {
  return loadSetting(DOWNLOADED_PREFIX + repo) === "yes" && (await inCache(repo));
}

/** Whether a model may load now: fully downloaded, or the user chose to download. */
export async function mayLoad(repo: string): Promise<boolean> {
  return downloadsAllowed.value || (await isDownloaded(repo));
}

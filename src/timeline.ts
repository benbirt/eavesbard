// The session timeline: one ordered record of everything that happened —
// speech, classifier calls, scene decisions, music — shown on the page and
// stored in IndexedDB for export as JSONL (DESIGN.md 7.9).

import { signal } from "@preact/signals";
import type { Intensity, Setting } from "./library/scenes.js";

export interface Scene {
  setting: Setting;
  intensity: Intensity;
}

export type TimelineEvent =
  | { kind: "session"; text: string }
  | { kind: "speech"; text: string; durationS: number; latencyMs?: number; dropped?: string }
  | {
      kind: "call";
      purpose: "opening" | "scene" | "pick";
      /** e.g. "claude-haiku-5-5" or "local (bge-small)". */
      model: string;
      userText: string;
      result?: {
        setting: Setting | "unknown";
        settingConfidence: number;
        intensity: Intensity;
        intensityConfidence: number;
        reason: string;
      };
      /** For purpose "pick": the track Claude chose. */
      pick?: { trackId: number; title: string; reason: string };
      latencyMs?: number;
      costUsd?: number;
      usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
      error?: string;
    }
  | { kind: "decision"; changed: boolean; from: Scene; to: Scene; notes: { setting: string; intensity: string } }
  | {
      kind: "music";
      text: string;
      trackId?: number;
      /** Which chooser picked it, when a track was chosen. */
      chooser?: TrackChooser;
    }
  | { kind: "error"; text: string };

export type TimelineKind = TimelineEvent["kind"];

export type TrackChooser = "claude" | "local" | "random";

/** Which models make the decisions (DESIGN.md 7.5, 7.7). */
export type Engine = "claude" | "local";

export interface TimelineEntry {
  sessionId: string;
  /** Order within the session. */
  seq: number;
  /** Milliseconds since the epoch. */
  at: number;
  event: TimelineEvent;
}

/** This session's entries, oldest first. */
export const timeline = signal<TimelineEntry[]>([]);
export const sessionId = signal<string | undefined>(undefined);
/** False if the browser refused storage; the timeline then lives only in memory. */
export const storageOk = signal(true);

let seq = 0;

export function newSession(): string {
  const id = new Date().toISOString();
  sessionId.value = id;
  timeline.value = [];
  seq = 0;
  return id;
}

export function record(event: TimelineEvent): void {
  const id = sessionId.value ?? newSession();
  const entry: TimelineEntry = { sessionId: id, seq: seq++, at: Date.now(), event };
  timeline.value = [...timeline.value, entry];
  void store(entry);
}

// --- IndexedDB ---

const DB_NAME = "eavesbard";
const STORE = "timeline";
let dbPromise: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["sessionId", "seq"] });
      store.createIndex("session", "sessionId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function done(request: IDBRequest | IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    if (request instanceof IDBTransaction) {
      request.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
    } else {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }
  });
}

async function store(entry: TimelineEntry): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    await done(tx);
  } catch {
    storageOk.value = false;
  }
}

async function readAll(session?: string): Promise<TimelineEntry[]> {
  const store = (await db()).transaction(STORE).objectStore(STORE);
  const request = session ? store.index("session").getAll(session) : store.getAll();
  await done(request);
  return (request.result as TimelineEntry[]).sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq);
}

/** Stored session ids, oldest first. */
export async function storedSessions(): Promise<string[]> {
  try {
    return [...new Set((await readAll()).map((e) => e.sessionId))];
  } catch {
    return [];
  }
}

/** Entries as JSON Lines, one entry per line. */
export function toJsonl(entries: readonly TimelineEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}

/** Downloads the current session (or every stored session) as a .jsonl file. */
export async function exportJsonl(all: boolean): Promise<void> {
  let entries: TimelineEntry[];
  try {
    entries = all ? await readAll() : await readAll(sessionId.value);
  } catch {
    entries = all ? [] : timeline.value;
  }
  if (!all && entries.length === 0) entries = timeline.value;
  const blob = new Blob([toJsonl(entries)], { type: "application/x-ndjson" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  link.download = `eavesbard-${all ? "all-sessions" : "session"}-${stamp}.jsonl`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

/** Deletes every stored session, keeping the current one on screen. */
export async function clearStored(): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await done(tx);
  } catch {
    storageOk.value = false;
  }
}

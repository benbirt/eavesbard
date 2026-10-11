// The session timeline: one ordered record of everything that happened —
// speech, classifier calls, scene decisions, music — shown on the page and
// kept in memory only, to save to a file or copy as JSONL (DESIGN.md 7.9).

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
      /** Asked alongside, for comparison (a debug option); the answer changed nothing. */
      comparison?: boolean;
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
  | { kind: "error"; text: string }
  /** What the audio element or Cast receiver reported (requesting, playing, buffering, Cast state). */
  | { kind: "playback"; output: "local" | "cast"; type: "playing" | "waiting" | "ended" | "info"; detail: string };

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
}

// Sessions used to be kept in IndexedDB. They now live only in memory, so
// remove anything an earlier version left behind (transcripts included).
try {
  indexedDB.deleteDatabase("eavesbard");
} catch {
  // No IndexedDB here (e.g. tests): nothing to remove.
}

/** Entries as JSON Lines, one entry per line. */
export function toJsonl(entries: readonly TimelineEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}

/** Saves this session as a .jsonl file in the browser's downloads. */
export function saveToFile(): void {
  const blob = new Blob([toJsonl(timeline.value)], { type: "application/x-ndjson" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  link.download = `eavesbard-session-${stamp}.jsonl`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

/** Copies this session, as JSON Lines, to the clipboard. Rejects if the browser refuses. */
export function copyToClipboard(): Promise<void> {
  return navigator.clipboard.writeText(toJsonl(timeline.value));
}

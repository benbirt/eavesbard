import type { Scene } from "../scene/selector.js";

/** What a track chooser needs to know about the moment a track is needed for. */
export interface PickRequest {
  /** e.g. "opening scene", "intensity changed to combat", "the last track ended". */
  why: string;
  scene: Scene;
  /** The opening-scene description, when choosing the first track. */
  description?: string;
  /** Recent transcript lines, oldest first. */
  transcript: string[];
  playingId?: number;
  /** Recently played track ids, newest first. */
  recentIds: number[];
}

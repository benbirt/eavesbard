// Picks tracks for a scene (DESIGN.md 7.7).

import type { Intensity, Setting } from "../library/scenes.js";
import { bucket, type Library, type LibraryTrack } from "../library/tag-map.js";

export interface Scene {
  setting: Setting;
  intensity: Intensity;
}

/** How many recently played tracks to avoid repeating. */
export const RECENT_LIMIT = 5;

/**
 * The tracks to choose from for a scene. Empty buckets fall back first to the
 * same intensity in any setting, then to the same setting at any intensity.
 */
export function candidates(library: Library, scene: Scene): LibraryTrack[] {
  const exact = bucket(library, scene.setting, scene.intensity);
  if (exact.length > 0) return exact;
  const sameIntensity = library.tracks.filter((t) => t.intensities.includes(scene.intensity));
  if (sameIntensity.length > 0) return sameIntensity;
  return library.tracks.filter((t) => t.settings.includes(scene.setting));
}

/**
 * The tracks a chooser may pick from: the scene's candidates, minus recently
 * played tracks (newest first in `recent`). In a small pool only the track
 * just played is avoided; a pool of one keeps that track.
 *
 * `leavingIntensity`, on an intensity change, prefers tracks not also tagged
 * with the intensity being left, so the change is audible: first from the
 * scene's own candidates, then from the same intensity in any setting, and
 * only then any candidate.
 */
export function choices(
  library: Library,
  scene: Scene,
  recent: readonly number[],
  leavingIntensity?: Intensity,
): LibraryTrack[] {
  const all = candidates(library, scene);
  let pool = all;
  if (leavingIntensity) {
    const distinct = (tracks: LibraryTrack[]) => tracks.filter((t) => !t.intensities.includes(leavingIntensity));
    const sameIntensity = library.tracks.filter((t) => t.intensities.includes(scene.intensity));
    pool = [distinct(all), distinct(sameIntensity), all].find((p) => p.length > 0) ?? all;
  }
  const avoid = new Set(pool.length > RECENT_LIMIT ? recent.slice(0, RECENT_LIMIT) : recent.slice(0, 1));
  const fresh = pool.filter((t) => !avoid.has(t.track.id));
  return fresh.length > 0 ? fresh : pool;
}

/** Picks a random track from `choices`. */
export function pickTrack(
  library: Library,
  scene: Scene,
  recent: readonly number[],
  random: () => number = Math.random,
  leavingIntensity?: Intensity,
): LibraryTrack | undefined {
  const pool = choices(library, scene, recent, leavingIntensity);
  return pool[Math.floor(random() * pool.length)];
}

/** Whether a playing track also suits a new scene, so it can carry on. */
export function suits(track: LibraryTrack, scene: Scene): boolean {
  return track.settings.includes(scene.setting) && track.intensities.includes(scene.intensity);
}

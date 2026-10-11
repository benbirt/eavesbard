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
 * Where to borrow from when a setting has no track for an intensity, nearest
 * first: a fight in a tavern sounds more like one in a town or a hall than
 * one in a dungeon.
 */
export const NEARBY: Record<Setting, Setting[]> = {
  tavern: ["interior", "town"],
  town: ["tavern", "interior", "travel"],
  interior: ["tavern", "town", "dungeon"],
  wilderness: ["travel", "dungeon"],
  dungeon: ["interior", "wilderness"],
  travel: ["wilderness", "town"],
};

/**
 * Tracks of `intensity` borrowed for `setting`: from its nearby settings,
 * and only tracks that belong nowhere further away (a tavern doesn't borrow
 * a temple that's also a dungeon). Falls back to any nearby track.
 */
function borrowed(library: Library, setting: Setting, intensity: Intensity): LibraryTrack[] {
  const near = [setting, ...NEARBY[setting]];
  const nearby = [...new Set(NEARBY[setting].flatMap((s) => bucket(library, s, intensity)))];
  const close = nearby.filter((t) => t.settings.every((s) => near.includes(s)));
  return close.length > 0 ? close : nearby;
}

/**
 * The tracks to choose from for a scene. Empty buckets borrow the same
 * intensity from nearby settings, then from any setting, then fall back to
 * the same setting at any intensity.
 */
export function candidates(library: Library, scene: Scene): LibraryTrack[] {
  const exact = bucket(library, scene.setting, scene.intensity);
  if (exact.length > 0) return exact;
  const nearby = borrowed(library, scene.setting, scene.intensity);
  if (nearby.length > 0) return nearby;
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
 * with the intensity being left, so the change is audible, but only among
 * the scene's own setting's tracks: if they're all also tagged with the old
 * intensity, they're used anyway, rather than borrowing. A tense tavern track
 * that can also be calm beats a haunted temple or a library (Candledeep was
 * once picked for a tense tavern). Only a setting with no tracks for the
 * intensity borrows, preferring distinct tracks from nearby settings.
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
    const exact = bucket(library, scene.setting, scene.intensity);
    const sameIntensity = library.tracks.filter((t) => t.intensities.includes(scene.intensity));
    pool = [distinct(exact), exact, distinct(all), distinct(sameIntensity), all].find((p) => p.length > 0) ?? all;
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

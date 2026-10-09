import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "./scenes.js";
import { TAG_FACETS, type IndexedTrack, type TagFacet } from "./tracks-file.js";

/**
 * A bucket matches a track if any listed tag is among the track's tags for
 * that facet, or any listed word appears as a whole word (ignoring case) in
 * the track's title or keywords.
 */
export type BucketRule = Partial<Record<TagFacet | "words", string[]>>;

/** `config/tag-map.json`: how Tabletop Audio's metadata maps onto our scenes. */
export interface TagMap {
  /** A track is in scope if it has an included genre and no excluded one. */
  genres: { include: string[]; exclude: string[] };
  /** Track ids brought into scope, or taken out of it, regardless of genre. */
  includeTracks: number[];
  excludeTracks: number[];
  setting: Record<Setting, BucketRule>;
  intensity: Record<Intensity, BucketRule>;
  /** Most in-scope tracks allowed to lack a setting or intensity (see DESIGN.md 7.1). */
  maxUnmapped: number;
}

export interface LibraryTrack {
  track: IndexedTrack;
  settings: Setting[];
  intensities: Intensity[];
}

export interface Library {
  /** In-scope tracks with at least one setting and one intensity. */
  tracks: LibraryTrack[];
  /** Tracks left out by genre or by `excludeTracks`. */
  outOfScope: IndexedTrack[];
  /** In-scope tracks the map gives no setting or no intensity. */
  unmapped: IndexedTrack[];
}

const RULE_KEYS = [...TAG_FACETS, "words"] as const;

/** Checks that `data` has the shape of a tag map, throwing a descriptive error if not. */
export function parseTagMap(data: unknown): TagMap {
  const map = object(data, "tag map");
  const genres = object(map["genres"], "genres");
  strings(genres["include"], "genres.include");
  strings(genres["exclude"], "genres.exclude");
  ids(map["includeTracks"], "includeTracks");
  ids(map["excludeTracks"], "excludeTracks");
  rules(map["setting"], "setting", SETTINGS);
  rules(map["intensity"], "intensity", INTENSITIES);
  if (!Number.isInteger(map["maxUnmapped"])) throw new Error("maxUnmapped: expected an integer");
  return data as TagMap;
}

/** Sorts tracks into setting and intensity buckets. */
export function buildLibrary(tracks: readonly IndexedTrack[], map: TagMap): Library {
  const include = new Set(map.genres.include);
  const exclude = new Set(map.genres.exclude);
  const library: Library = { tracks: [], outOfScope: [], unmapped: [] };
  for (const track of tracks) {
    const inScope = map.includeTracks.includes(track.id)
      ? true
      : !map.excludeTracks.includes(track.id) &&
        track.genres.some((g) => include.has(g)) &&
        !track.genres.some((g) => exclude.has(g));
    if (!inScope) {
      library.outOfScope.push(track);
      continue;
    }
    const settings = SETTINGS.filter((s) => matches(track, map.setting[s]));
    const intensities = INTENSITIES.filter((i) => matches(track, map.intensity[i]));
    if (settings.length === 0 || intensities.length === 0) library.unmapped.push(track);
    else library.tracks.push({ track, settings, intensities });
  }
  return library;
}

/** The tracks in one setting and intensity bucket. */
export function bucket(library: Library, setting: Setting, intensity: Intensity): LibraryTrack[] {
  return library.tracks.filter((t) => t.settings.includes(setting) && t.intensities.includes(intensity));
}

function matches(track: IndexedTrack, rule: BucketRule): boolean {
  for (const facet of TAG_FACETS) {
    if (rule[facet]?.some((tag) => track.tags[facet].includes(tag))) return true;
  }
  const words = rule.words ?? [];
  if (words.length === 0) return false;
  const text = [track.title, ...track.keywords].join(" ").toLowerCase();
  return words.some((word) => new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`).test(text));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function object(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown, where: string): void {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`${where}: expected an array of strings`);
  }
}

function ids(value: unknown, where: string): void {
  if (!Array.isArray(value) || !value.every((v) => Number.isInteger(v))) {
    throw new Error(`${where}: expected an array of track ids`);
  }
}

function rules(value: unknown, where: string, names: readonly string[]): void {
  const buckets = object(value, where);
  for (const key of Object.keys(buckets)) {
    if (!names.includes(key)) throw new Error(`${where}.${key}: not one of ${names.join(", ")}`);
  }
  for (const name of names) {
    const rule = object(buckets[name], `${where}.${name}`);
    for (const key of Object.keys(rule)) {
      if (!(RULE_KEYS as readonly string[]).includes(key)) {
        throw new Error(`${where}.${name}.${key}: not one of ${RULE_KEYS.join(", ")}`);
      }
      strings(rule[key], `${where}.${name}.${key}`);
    }
  }
}

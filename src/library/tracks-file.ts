/**
 * The generated track index, `data/tracks.json`. Written by
 * `scripts/build-index.ts` from tabletopaudio.com; never edited by hand.
 */

export const TAG_FACETS = ["civ", "biome", "mood", "action"] as const;
export type TagFacet = (typeof TAG_FACETS)[number];

export interface IndexedTrack {
  /** Tabletop Audio's track number. */
  id: number;
  title: string;
  description: string;
  /** Genre filters from the site, e.g. "fantasy", "scifi" (excludes "music"). */
  genres: string[];
  /** Whether the site files the track under its "music" filter. */
  hasMusic: boolean;
  /** As shown on the site, e.g. "ambience + music". Empty when not given. */
  type: string;
  /** Curated tags from the site, one list per facet. */
  tags: Record<TagFacet, string[]>;
  /** Free-text search keywords from the site. Often empty. */
  keywords: string[];
  /** File stem on the audio host: https://sounds.tabletopaudio.com/<file>.mp3 */
  file: string;
}

export interface TracksFile {
  /** ISO 8601 time the content last changed. */
  generated: string;
  source: string;
  tracks: IndexedTrack[];
}

/** Checks that `data` has the shape of a tracks file, throwing a descriptive error if not. */
export function parseTracksFile(data: unknown): TracksFile {
  const file = record(data, "tracks file");
  string(file["generated"], "generated");
  string(file["source"], "source");
  if (!Array.isArray(file["tracks"])) throw new Error("tracks: expected an array");
  const ids = new Set<number>();
  file["tracks"].forEach((t, i) => {
    const where = `tracks[${i}]`;
    const track = record(t, where);
    if (!Number.isInteger(track["id"])) throw new Error(`${where}.id: expected an integer`);
    if (ids.has(track["id"] as number)) throw new Error(`${where}.id: duplicate id ${track["id"]}`);
    ids.add(track["id"] as number);
    for (const key of ["title", "description", "type", "file"]) string(track[key], `${where}.${key}`);
    if (!track["title"] || !track["file"]) throw new Error(`${where}: title and file must not be empty`);
    if (typeof track["hasMusic"] !== "boolean") throw new Error(`${where}.hasMusic: expected a boolean`);
    strings(track["genres"], `${where}.genres`);
    strings(track["keywords"], `${where}.keywords`);
    const tags = record(track["tags"], `${where}.tags`);
    for (const facet of TAG_FACETS) strings(tags[facet], `${where}.tags.${facet}`);
  });
  return data as TracksFile;
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, where: string): void {
  if (typeof value !== "string") throw new Error(`${where}: expected a string`);
}

function strings(value: unknown, where: string): void {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`${where}: expected an array of strings`);
  }
}

// Checks the committed data/tracks.json and config/tag-map.json together.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { INTENSITIES, SETTINGS } from "../src/library/scenes.js";
import { bucket, buildLibrary, parseTagMap, type BucketRule } from "../src/library/tag-map.js";
import { parseTracksFile, TAG_FACETS } from "../src/library/tracks-file.js";

const tracks = parseTracksFile(JSON.parse(readFileSync("data/tracks.json", "utf8"))).tracks;
const map = parseTagMap(JSON.parse(readFileSync("config/tag-map.json", "utf8")));
const library = buildLibrary(tracks, map);

test("data/tracks.json is a valid tracks file", () => {
  assert.ok(tracks.length > 0);
});

test("every setting and intensity bucket has tracks", () => {
  const empty = SETTINGS.flatMap((s) => INTENSITIES.filter((i) => bucket(library, s, i).length === 0).map((i) => `${s}/${i}`));
  assert.deepEqual(empty, []);
});

test("unmapped tracks haven't grown beyond maxUnmapped", () => {
  const titles = library.unmapped.map((t) => `${t.id} ${t.title}`).join("\n  ");
  assert.ok(
    library.unmapped.length <= map.maxUnmapped,
    `${library.unmapped.length} unmapped tracks (limit ${map.maxUnmapped}); update config/tag-map.json:\n  ${titles}`,
  );
});

test("every tag, genre and track id in the map exists in the data", () => {
  const known = new Set(tracks.flatMap((t) => [...TAG_FACETS.flatMap((f) => t.tags[f].map((v) => `${f}:${v}`)), ...t.genres.map((g) => `genre:${g}`)]));
  const ids = new Set(tracks.map((t) => t.id));
  const missing: string[] = [];
  for (const g of [...map.genres.include, ...map.genres.exclude]) if (!known.has(`genre:${g}`)) missing.push(`genre:${g}`);
  for (const id of [...map.includeTracks, ...map.excludeTracks]) if (!ids.has(id)) missing.push(`track ${id}`);
  const rules: BucketRule[] = [...Object.values(map.setting), ...Object.values(map.intensity)];
  for (const rule of rules) {
    for (const facet of TAG_FACETS) for (const v of rule[facet] ?? []) if (!known.has(`${facet}:${v}`)) missing.push(`${facet}:${v}`);
  }
  assert.deepEqual(missing, []);
});

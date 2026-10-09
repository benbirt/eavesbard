import assert from "node:assert/strict";
import { test } from "node:test";
import { bucket, buildLibrary, parseTagMap, type TagMap } from "./tag-map.js";
import type { IndexedTrack } from "./tracks-file.js";

function track(id: number, over: Partial<IndexedTrack> = {}): IndexedTrack {
  return {
    id,
    title: `Track ${id}`,
    description: "",
    genres: ["fantasy"],
    hasMusic: false,
    type: "ambience",
    tags: { civ: [], biome: [], mood: [], action: [], ...over.tags },
    keywords: [],
    file: `${id}_Track`,
    ...over,
  };
}

const MAP: TagMap = {
  genres: { include: ["fantasy"], exclude: ["scifi"] },
  includeTracks: [],
  excludeTracks: [],
  setting: {
    tavern: { words: ["inn"] },
    interior: {},
    town: { civ: ["cities"] },
    wilderness: { biome: ["forest"] },
    dungeon: { biome: ["underground"] },
    travel: {},
  },
  intensity: {
    calm: { mood: ["peaceful"] },
    tense: { mood: ["tension"] },
    combat: { action: ["war"] },
  },
  maxUnmapped: 0,
};

test("tracks land in every bucket their tags and words match", () => {
  const forestInn = track(1, {
    title: "The Forest Inn",
    tags: { civ: [], biome: ["forest"], mood: ["peaceful", "tension"], action: [] },
  });
  const library = buildLibrary([forestInn], MAP);
  assert.deepEqual(library.tracks[0]?.settings, ["tavern", "wilderness"]);
  assert.deepEqual(library.tracks[0]?.intensities, ["calm", "tense"]);
  assert.equal(bucket(library, "tavern", "tense").length, 1);
  assert.equal(bucket(library, "town", "calm").length, 0);
});

test("words match whole words in titles and keywords, ignoring case", () => {
  const calm = { civ: [], biome: [], mood: ["peaceful"], action: [] };
  const library = buildLibrary(
    [
      track(1, { title: "Spinning Wheel", tags: calm }),
      track(2, { keywords: ["INN"], tags: calm }),
    ],
    MAP,
  );
  assert.deepEqual(library.tracks.map((t) => t.track.id), [2]);
  assert.deepEqual(library.unmapped.map((t) => t.id), [1]);
});

test("genres and track lists decide what's in scope", () => {
  const tags = { civ: ["cities"], biome: [], mood: ["peaceful"], action: [] };
  const library = buildLibrary(
    [
      track(1, { tags }),
      track(2, { tags, genres: ["fantasy", "scifi"] }),
      track(3, { tags, genres: [] }),
      track(4, { tags, genres: ["scifi"] }),
      track(5, { tags }),
    ],
    { ...MAP, includeTracks: [4], excludeTracks: [5] },
  );
  assert.deepEqual(library.tracks.map((t) => t.track.id), [1, 4]);
  assert.deepEqual(library.outOfScope.map((t) => t.id), [2, 3, 5]);
});

test("parseTagMap rejects unknown buckets and rule keys", () => {
  assert.equal(parseTagMap(MAP), MAP);
  assert.throws(
    () => parseTagMap({ ...MAP, setting: { ...MAP.setting, castle: {} } }),
    /setting\.castle: not one of/,
  );
  assert.throws(
    () => parseTagMap({ ...MAP, intensity: { ...MAP.intensity, calm: { moods: ["peaceful"] } } }),
    /intensity\.calm\.moods: not one of/,
  );
  const { travel: _, ...noTravel } = MAP.setting;
  assert.throws(() => parseTagMap({ ...MAP, setting: noTravel }), /setting\.travel: expected an object/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Intensity, Setting } from "../library/scenes.js";
import type { Library, LibraryTrack } from "../library/tag-map.js";
import { candidates, choices, pickTrack, suits } from "./selector.js";

function entry(id: number, settings: Setting[], intensities: Intensity[]): LibraryTrack {
  return {
    track: {
      id,
      title: `T${id}`,
      description: "",
      genres: [],
      hasMusic: false,
      type: "",
      tags: { civ: [], biome: [], mood: [], action: [] },
      keywords: [],
      file: `${id}`,
    },
    settings,
    intensities,
  };
}

const library: Library = {
  tracks: [
    ...[1, 2, 3, 4, 5, 6, 7].map((id) => entry(id, ["town"], ["calm"])),
    entry(10, ["tavern"], ["calm"]),
    entry(11, ["tavern"], ["calm"]),
    entry(20, ["dungeon"], ["combat"]),
    entry(30, ["travel"], ["calm", "combat"]),
    entry(31, ["travel"], ["combat"]),
    entry(40, ["tavern"], ["calm", "combat"]),
  ],
  outOfScope: [],
  unmapped: [],
};

test("empty buckets borrow from nearby settings, then any setting, then the same setting", () => {
  // Wilderness borrows from travel, then dungeon.
  assert.deepEqual(candidates(library, { setting: "wilderness", intensity: "combat" }).map((t) => t.track.id), [30, 31, 20]);
  // Interior borrows from tavern, town, then dungeon, nearest first.
  assert.deepEqual(candidates(library, { setting: "interior", intensity: "combat" }).map((t) => t.track.id), [40, 20]);
  // Town has no combat nearby (tavern 40, interior none, travel 30 and 31): those three.
  assert.deepEqual(candidates(library, { setting: "town", intensity: "combat" }).map((t) => t.track.id), [40, 30, 31]);
  assert.deepEqual(candidates(library, { setting: "tavern", intensity: "tense" }).map((t) => t.track.id), [10, 11, 40]);
  assert.deepEqual(candidates(library, { setting: "dungeon", intensity: "tense" }).map((t) => t.track.id), [20]);
});

test("recently played tracks are avoided", () => {
  const recent = [1, 2, 3, 4, 5];
  for (let i = 0; i < 20; i++) {
    const picked = pickTrack(library, { setting: "town", intensity: "calm" }, recent, () => i / 20);
    assert.ok([6, 7].includes(picked!.track.id));
  }
});

test("in a small bucket only the last track is avoided", () => {
  // Tavern calm has three tracks; only 10, the last played, is avoided.
  for (let i = 0; i < 10; i++) {
    const id = pickTrack(library, { setting: "tavern", intensity: "calm" }, [10, 11], () => i / 10)?.track.id;
    assert.ok([11, 40].includes(id!), String(id));
  }
  // A bucket of one repeats its track.
  assert.equal(pickTrack(library, { setting: "dungeon", intensity: "combat" }, [20])?.track.id, 20);
});

test("on an intensity change, tracks also tagged with the old intensity are avoided", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(pickTrack(library, { setting: "travel", intensity: "combat" }, [], () => i / 10, "calm")?.track.id, 31);
  }
  // A bucket with nothing distinct keeps its own tracks rather than borrowing...
  assert.deepEqual(choices(library, { setting: "tavern", intensity: "combat" }, [], "calm").map((t) => t.track.id), [40]);
  const nearby: Library = { ...library, tracks: [...library.tracks, entry(50, ["town"], ["combat"]), entry(51, ["town", "dungeon"], ["combat"])] };
  assert.deepEqual(choices(nearby, { setting: "tavern", intensity: "combat" }, [], "calm").map((t) => t.track.id), [40]);
  // ...and an empty bucket borrows distinct tracks from nearby settings (for an interior: tavern, town, dungeon).
  assert.deepEqual(choices(nearby, { setting: "interior", intensity: "combat" }, [], "calm").map((t) => t.track.id), [50, 51, 20]);
  // With nothing of its own or nearby, it borrows distinct tracks from anywhere.
  for (let i = 0; i < 10; i++) {
    const id = pickTrack(library, { setting: "wilderness", intensity: "combat" }, [], () => i / 10, "calm")?.track.id;
    assert.ok([20, 31].includes(id!), String(id));
  }
  // ...and settles for any candidate only when nothing else fits.
  assert.equal(pickTrack(library, { setting: "dungeon", intensity: "combat" }, [], () => 0, "combat")?.track.id, 20);
});

test("suits checks both axes", () => {
  const track = library.tracks[0]!;
  assert.equal(suits(track, { setting: "town", intensity: "calm" }), true);
  assert.equal(suits(track, { setting: "town", intensity: "tense" }), false);
});

test("an empty bucket takes the tag map's hand-picked tracks first", () => {
  const picked: Library = { ...library, borrow: { "tavern/combat": [entry(31, ["travel"], ["combat"])] } };
  assert.deepEqual(candidates(picked, { setting: "tavern", intensity: "combat" }).map((t) => t.track.id), [40]);
  const empty: Library = { ...picked, tracks: picked.tracks.filter((t) => t.track.id !== 40) };
  assert.deepEqual(candidates(empty, { setting: "tavern", intensity: "combat" }).map((t) => t.track.id), [31]);
});

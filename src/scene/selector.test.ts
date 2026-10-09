import assert from "node:assert/strict";
import { test } from "node:test";
import type { Intensity, Setting } from "../library/scenes.js";
import type { Library, LibraryTrack } from "../library/tag-map.js";
import { candidates, pickTrack, suits } from "./selector.js";

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
  ],
  outOfScope: [],
  unmapped: [],
};

test("empty buckets fall back to the same intensity, then the same setting", () => {
  assert.deepEqual(candidates(library, { setting: "wilderness", intensity: "combat" }).map((t) => t.track.id), [20]);
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
  for (let i = 0; i < 10; i++) {
    assert.equal(pickTrack(library, { setting: "tavern", intensity: "calm" }, [10, 11], () => i / 10)?.track.id, 11);
  }
  // A bucket of one repeats its track.
  assert.equal(pickTrack(library, { setting: "dungeon", intensity: "combat" }, [20])?.track.id, 20);
});

test("suits checks both axes", () => {
  const track = library.tracks[0]!;
  assert.equal(suits(track, { setting: "town", intensity: "calm" }), true);
  assert.equal(suits(track, { setting: "town", intensity: "tense" }), false);
});

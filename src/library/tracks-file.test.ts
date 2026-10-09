import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTracksFile } from "./tracks-file.js";

const track = {
  id: 1,
  title: "Invented Track",
  description: "",
  genres: ["fantasy"],
  hasMusic: false,
  type: "ambience",
  tags: { civ: [], biome: ["forest"], mood: [], action: [] },
  keywords: [],
  file: "1_Invented_Track",
};
const valid = { generated: "2026-01-01T00:00:00.000Z", source: "https://example.com/", tracks: [track] };

test("accepts a well-formed file", () => {
  assert.equal(parseTracksFile(valid), valid);
});

test("rejects malformed files with a pointer to the problem", () => {
  assert.throws(() => parseTracksFile([]), /tracks file: expected an object/);
  assert.throws(() => parseTracksFile({ ...valid, tracks: [{ ...track, id: "1" }] }), /tracks\[0\]\.id/);
  assert.throws(
    () => parseTracksFile({ ...valid, tracks: [{ ...track, tags: { ...track.tags, mood: [1] } }] }),
    /tracks\[0\]\.tags\.mood/,
  );
  assert.throws(() => parseTracksFile({ ...valid, tracks: [track, track] }), /duplicate id 1/);
  assert.throws(() => parseTracksFile({ ...valid, tracks: [{ ...track, file: "" }] }), /must not be empty/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseTracksFile } from "../src/library/tracks-file.js";

test("data/tracks.json is a valid tracks file", () => {
  const file = parseTracksFile(JSON.parse(readFileSync("data/tracks.json", "utf8")));
  assert.ok(file.tracks.length > 0);
});

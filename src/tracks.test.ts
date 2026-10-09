import assert from "node:assert/strict";
import { test } from "node:test";
import { audioUrl } from "./tracks.js";

test("audio URL uses the file stem as published", () => {
  assert.equal(audioUrl("4_Solemn_Vow-a"), "https://sounds.tabletopaudio.com/4_Solemn_Vow-a.mp3");
});

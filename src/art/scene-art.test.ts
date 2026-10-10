import assert from "node:assert/strict";
import { test } from "node:test";
import { INTENSITIES } from "../library/scenes.js";
import { pickArt, SCENE_ART } from "./scene-art.js";

test("every intensity has art, and every image has a file, title and book", () => {
  for (const i of INTENSITIES) assert.ok(SCENE_ART.some((a) => a.intensity === i), i);
  for (const a of SCENE_ART) assert.ok(a.file.endsWith(".webp") && a.title && a.book, a.file);
  assert.equal(new Set(SCENE_ART.map((a) => a.file)).size, SCENE_ART.length);
});

test("pickArt stays within the intensity and avoids repeating the previous image", () => {
  const first = pickArt("combat", undefined, () => 0);
  assert.equal(first.intensity, "combat");
  for (let n = 0; n < 20; n++) assert.notEqual(pickArt("combat", first).file, first.file);
});

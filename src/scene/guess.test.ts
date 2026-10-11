import assert from "node:assert/strict";
import { test } from "node:test";
import { tagMap as map } from "../library-data.js";
import { guessScene } from "./guess.js";

test("guesses the setting from the tag map's words, plurals included", () => {
  assert.deepEqual(guessScene("party is exploring a series of underground caverns", map), { setting: "dungeon", intensity: "calm" });
  assert.equal(guessScene("a smoky tavern on the edge of town", map).setting, "tavern");
  assert.equal(guessScene("sailing to the islands on a merchant ship", map).setting, "travel");
  assert.equal(guessScene("a quiet night camping in the woods", map).setting, "wilderness");
});

test("guesses the intensity from its words", () => {
  assert.deepEqual(guessScene("goblins ambush the caravan", map), { setting: "travel", intensity: "combat" });
  assert.equal(guessScene("sneaking through the crypt", map).intensity, "tense");
});

test("guesses nothing from words it doesn't know", () => {
  assert.deepEqual(guessScene("let's see what happens", map), { setting: undefined, intensity: undefined });
});

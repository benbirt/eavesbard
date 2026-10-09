import assert from "node:assert/strict";
import { test } from "node:test";
import { hallucinationReason } from "./hallucination.js";

test("real table talk passes", () => {
  for (const text of [
    "Roll for initiative.",
    "The innkeeper slides a key across the bar.",
    "Thank you, I'll take the room.",
    "I attack the goblin, I attack it again, and again.",
  ]) {
    assert.equal(hallucinationReason(text), undefined, text);
  }
});

test("known hallucinations are caught", () => {
  assert.equal(hallucinationReason("  "), "empty");
  assert.equal(hallucinationReason("[Music]"), "annotation");
  assert.equal(hallucinationReason("(upbeat music) [BLANK_AUDIO]"), "annotation");
  assert.equal(hallucinationReason("♪♪"), "annotation");
  assert.equal(hallucinationReason("..."), "no words");
  assert.equal(hallucinationReason("Thanks for watching!"), "known phrase");
  assert.equal(hallucinationReason(" you"), "known phrase");
  assert.equal(hallucinationReason("the the the the the the the"), "repetition");
  assert.equal(hallucinationReason("I'm sorry. I'm sorry. I'm sorry. I'm sorry. I'm sorry."), "repetition");
});

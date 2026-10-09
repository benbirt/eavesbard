import assert from "node:assert/strict";
import { test } from "node:test";
import { findKeyword } from "./keywords.js";

const PHRASES = ["roll initiative", "initiative order"];

test("matches phrases regardless of case, punctuation and an optional 'for'", () => {
  assert.equal(findKeyword("Okay, everyone ROLL INITIATIVE!", PHRASES), "roll initiative");
  assert.equal(findKeyword("Roll for initiative.", PHRASES), "roll initiative");
  assert.equal(findKeyword("rolls for initiative", PHRASES), "roll initiative");
  assert.equal(findKeyword("What's the initiative order?", PHRASES), "initiative order");
});

test("needs whole words in sequence", () => {
  assert.equal(findKeyword("He took the initiative and rolled away", PHRASES), undefined);
  assert.equal(findKeyword("scroll initiatives", PHRASES), undefined);
  assert.equal(findKeyword("", PHRASES), undefined);
});

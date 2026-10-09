import assert from "node:assert/strict";
import { test } from "node:test";
import { findTrigger, triggerPhrases } from "./triggers.js";

test("flattens groups and skips comments", () => {
  assert.deepEqual(triggerPhrases({ _comment: "x", a: ["one", "two"], b: ["three", 4] }), ["one", "two", "three"]);
});

test("matches whole phrases ignoring case and punctuation", () => {
  const phrases = ["initiative", "you arrive"];
  assert.equal(findTrigger("Okay, everyone roll for INITIATIVE!", phrases), "initiative");
  assert.equal(findTrigger("...and finally you arrive, at the gates.", phrases), "you arrive");
  assert.equal(findTrigger("He showed real initiatives", phrases), undefined);
  assert.equal(findTrigger("you arrived late", phrases), undefined);
});

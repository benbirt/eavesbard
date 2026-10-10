import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFromScores, labelKey, lastWords, latest, scoreAxis } from "./local-classifier.js";

const scores = (entries: [string, number][]) => new Map(entries.map(([label, s]) => [labelKey(label, 0), s]));

test("the best-matching label wins, with a confidence from the gap", () => {
  const clear = scoreAxis(["calm", "tense", "combat"], scores([["calm", 0.5], ["tense", 0.52], ["combat", 0.7]]));
  assert.equal(clear.label, "combat");
  assert.ok(clear.confidence > 0.95);
  const close = scoreAxis(["calm", "tense", "combat"], scores([["calm", 0.6], ["tense", 0.61], ["combat", 0.5]]));
  assert.equal(close.label, "tense");
  assert.ok(close.confidence > 0.5 && close.confidence < 0.7);
});

test("each label scores its best description", () => {
  const map = new Map([[labelKey("calm", 0), 0.3], [labelKey("calm", 1), 0.8], [labelKey("combat", 0), 0.6]]);
  assert.equal(scoreAxis(["calm", "combat"], map).label, "calm");
});

test("off-topic talk makes the intensity ignorable", () => {
  const c = classifyFromScores(scores([["tavern", 0.6]]), scores([["combat", 0.5], ["offtopic", 0.7]]), {
    intensity: "tense",
  });
  assert.equal(c.setting, "tavern");
  assert.equal(c.intensity, "tense");
  assert.equal(c.intensityConfidence, 0);
});

test("weak similarity to every setting means unknown", () => {
  const c = classifyFromScores(scores([["tavern", 0.3]]), scores([["calm", 0.6]]), { intensity: "calm" });
  assert.equal(c.setting, "unknown");
});

test("lastWords and latest keep the end of the transcript", () => {
  assert.equal(lastWords(["one two", "three four five"], 3), "three four five");
  assert.equal(latest(["old line", "two", "three"]), "two three");
  assert.equal(latest(["a", "b c d"], 2), "c d");
});

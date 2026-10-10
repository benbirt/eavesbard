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

const llm = (setting: string, intensity: string) => ({
  model: "test llm",
  setting: { tavern: 0, town: 0, interior: 0, wilderness: 0, dungeon: 0, travel: 0, [setting]: 1 },
  intensity: { calm: 0, tense: 0, combat: 0, [intensity]: 1 },
});

test("an LLM answer is blended in: it can settle the setting but not overrule a clear fight", () => {
  // Embeddings: unsure between tavern and town, sure of combat. LLM: town, calm.
  const c = classifyFromScores(
    scores([["tavern", 0.61], ["town", 0.6]]),
    scores([["calm", 0.5], ["combat", 0.7]]),
    { intensity: "calm" },
    llm("town", "calm"),
  );
  assert.equal(c.setting, "town");
  assert.equal(c.intensity, "combat");
  assert.match(c.reason, /test llm: town, calm/);
});

test("with an LLM, a weak setting match isn't unknown, and off-topic still keeps the intensity", () => {
  const c = classifyFromScores(
    scores([["tavern", 0.3], ["dungeon", 0.29]]),
    scores([["combat", 0.5], ["offtopic", 0.7]]),
    { intensity: "tense" },
    llm("dungeon", "combat"),
  );
  assert.equal(c.setting, "dungeon");
  assert.equal(c.intensity, "tense");
  assert.equal(c.intensityConfidence, 0);
});

test("lastWords and latest keep the end of the transcript", () => {
  assert.equal(lastWords(["one two", "three four five"], 3), "three four five");
  assert.equal(latest(["old line", "two", "three"]), "two three");
  assert.equal(latest(["a", "b c d"], 2), "c d");
});

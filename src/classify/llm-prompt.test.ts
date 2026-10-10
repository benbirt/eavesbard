import assert from "node:assert/strict";
import { test } from "node:test";
import { fightOverQuestion, labelProbabilities, llmQuestions } from "./llm-prompt.js";

test("an opening description is asked about on both axes", () => {
  const [setting, intensity] = llmQuestions({ description: "deep caverns, exploring" });
  assert.equal(setting.axis, "setting");
  assert.deepEqual(setting.labels, ["tavern", "town", "interior", "wilderness", "dungeon", "travel"]);
  assert.match(setting.content, /opening scene: "deep caverns, exploring"/);
  assert.deepEqual(intensity.labels, ["calm", "tense", "combat"]);
});

test("a transcript question says what the scene was, and the intensity sees fewer words", () => {
  const lines = Array.from({ length: 100 }, (_, i) => `word${i}`);
  const [setting, intensity] = llmQuestions({ lines, current: { setting: "dungeon", intensity: "combat" } });
  assert.match(setting.content, /Until now the scene was: dungeon, combat/);
  assert.match(setting.content, /word0 /);
  assert.doesNotMatch(intensity.content, /word39 /);
  assert.match(intensity.content, /word40 /);
});

test("label probabilities add up spellings and sum to 1", () => {
  const p = labelProbabilities([[Math.log(0.2), Math.log(0.2)], [Math.log(0.1)]]);
  assert.ok(Math.abs(p[0]! - 0.8) < 1e-9);
  assert.ok(Math.abs(p[1]! - 0.2) < 1e-9);
});

test("invalid model output is an error, not a tie", () => {
  assert.throws(() => labelProbabilities([[NaN], [NaN]]), /invalid numbers/);
  assert.throws(() => labelProbabilities([[-Infinity], [Math.log(0.5)]]), /invalid numbers/);
  // Very unlikely labels are fine: only their relative size matters.
  const p = labelProbabilities([[-900], [-901]]);
  assert.ok(p[0]! > 0.7 && p[0]! < 0.75);
});

test("the fight-over question offers ongoing or over, with the latest lines", () => {
  const q = fightOverQuestion(["Roll for initiative.", "you killed the last enemy.", "Combat over."]);
  assert.deepEqual(q.labels, ["ongoing", "over"]);
  assert.match(q.content, /Combat over\."/);
});

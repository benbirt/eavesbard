import assert from "node:assert/strict";
import { test } from "node:test";
import { fightOverQuestion, fightQuestion, labelProbabilities, llmQuestions, mixIntensity } from "./llm-prompt.js";

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

test("the fight question asks whether a fight started, or during one whether it ended, with the newest line apart", () => {
  const lines = ["the barkeep pours you an ale", "Roll for initiative"];
  const start = fightQuestion(lines, { setting: "tavern", intensity: "calm" });
  assert.deepEqual(start.labels, ["yes", "no"]);
  assert.match(start.content, /Has a fight started\?/);
  assert.match(start.content, /Earlier:\n"the barkeep pours you an ale"\n\nJust now:\n"Roll for initiative"/);
  assert.match(fightQuestion(lines, { setting: "tavern", intensity: "combat" }).content, /Has the fight ended\?/);
});

test("the mixed intensity takes combat from the fight question and splits the rest like the three-way answer", () => {
  const m = mixIntensity({ calm: 0.6, tense: 0.2, combat: 0.2 }, 0.5);
  assert.ok(Math.abs(m.combat - 0.5) < 1e-9);
  assert.ok(Math.abs(m.calm - 0.375) < 1e-9);
  assert.ok(Math.abs(m.tense - 0.125) < 1e-9);
  assert.deepEqual(mixIntensity({ calm: 0, tense: 0, combat: 1 }, 0), { calm: 0.5, tense: 0.5, combat: 0 });
});

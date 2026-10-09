import assert from "node:assert/strict";
import { test } from "node:test";
import { openingMessage, parseClassification, userMessage } from "./classifier.js";

test("parses a well-formed answer and clamps confidences", () => {
  assert.deepEqual(
    parseClassification(
      '{"setting":"dungeon","setting_confidence":1.2,"intensity":"tense","intensity_confidence":0.7,"reason":"stairs"}',
    ),
    { setting: "dungeon", settingConfidence: 1, intensity: "tense", intensityConfidence: 0.7, reason: "stairs" },
  );
});

test("rejects values outside the label sets", () => {
  const base = { setting: "tavern", setting_confidence: 0.9, intensity: "calm", intensity_confidence: 0.9, reason: "" };
  assert.throws(() => parseClassification(JSON.stringify({ ...base, setting: "space" })), /setting/);
  assert.throws(() => parseClassification(JSON.stringify({ ...base, intensity: "panic" })), /intensity/);
  assert.throws(() => parseClassification(JSON.stringify({ ...base, setting_confidence: "high" })), /confidence/);
  assert.throws(() => parseClassification("not json"));
});

test("the opening message quotes the description", () => {
  assert.match(openingMessage("  underground, exploring "), /describes the opening scene as: "underground, exploring"/);
});

test("the user message gives the scene, its age and the transcript", () => {
  const text = userMessage({ setting: "tavern", intensity: "calm" }, 4 * 60_000, [
    { at: 10_000, text: "The barkeep nods." },
    { at: 70_000, text: "Roll initiative." },
  ], 100_000);
  assert.match(text, /setting tavern, intensity calm \(for about 4 minutes\)/);
  assert.match(text, /\[90s ago\] The barkeep nods\.\n\[30s ago\] Roll initiative\./);
});

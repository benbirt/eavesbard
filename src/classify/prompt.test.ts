import assert from "node:assert/strict";
import { test } from "node:test";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { SYSTEM_PROMPT } from "./prompt.js";

test("the system prompt is long enough to cache", () => {
  // Roughly 4 characters per token; leave a margin over the 512-token minimum.
  assert.ok(SYSTEM_PROMPT.length / 4 > 700, `only about ${Math.round(SYSTEM_PROMPT.length / 4)} tokens`);
});

test("the system prompt defines every label", () => {
  for (const label of [...SETTINGS, ...INTENSITIES, "unknown"]) {
    assert.match(SYSTEM_PROMPT, new RegExp(`^- ${label}:`, "m"), label);
  }
});

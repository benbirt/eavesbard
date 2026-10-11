import assert from "node:assert/strict";
import { test } from "node:test";
import { INTENSITIES, SETTINGS } from "../library/scenes.js";
import { LARGE_SET } from "./large-set.js";
import { SCENARIOS } from "./scenarios.js";
import { TEST_SET } from "./test-set.js";

test("scene names are unique across all sets", () => {
  const names = [...SCENARIOS, ...TEST_SET, ...LARGE_SET].map((s) => s.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("every scene accepts only known labels", () => {
  for (const s of LARGE_SET) {
    assert.ok(s.settings.length && s.intensities.length, s.name);
    for (const x of s.settings) assert.ok(x === "unknown" || (SETTINGS as readonly string[]).includes(x), `${s.name}: ${x}`);
    for (const x of s.intensities) assert.ok((INTENSITIES as readonly string[]).includes(x), `${s.name}: ${x}`);
  }
});

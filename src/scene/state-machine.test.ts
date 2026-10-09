import assert from "node:assert/strict";
import { test } from "node:test";
import type { Intensity, Setting } from "../library/scenes.js";
import { initialScene, nextScene, pendingChanges, type SceneEvent, type SceneState } from "./state-machine.js";

const MIN = 60_000;

function classify(
  at: number,
  setting: Setting | "unknown",
  intensity: Intensity,
  settingConfidence = 0.9,
  intensityConfidence = 0.9,
): SceneEvent {
  return { type: "classification", at, setting, intensity, settingConfidence, intensityConfidence };
}

/** Applies events in order; returns the final state and which events changed the scene. */
function run(events: SceneEvent[], start = initialScene(0)): { state: SceneState; changes: number[] } {
  let state = start;
  const changes: number[] = [];
  events.forEach((e, i) => {
    const t = nextScene(state, e);
    state = t.state;
    if (t.changed) changes.push(i);
  });
  return { state, changes };
}

test("starts in the default scene, or a chosen one", () => {
  const s = initialScene(5);
  assert.equal(s.setting, "tavern");
  assert.equal(s.intensity, "calm");
  const chosen = initialScene(5, { setting: "dungeon", intensity: "tense", reason: "described" });
  assert.deepEqual([chosen.setting, chosen.intensity, chosen.reason], ["dungeon", "tense", "described"]);
});

test("notes explain each decision in plain words", () => {
  let s = initialScene(0);
  let t = nextScene(s, classify(MIN, "dungeon", "tense"));
  assert.match(t.notes.setting, /dungeon: 1 of 2 agreeing results; waiting/);
  assert.match(t.notes.intensity, /tense: 1 of 2/);
  s = t.state;
  t = nextScene(s, classify(2 * MIN, "dungeon", "tense"));
  assert.match(t.notes.setting, /dungeon held back: a setting lasts at least 3 minutes, 60 s to go/);
  assert.match(t.notes.intensity, /calm → tense \(2 results agree\)/);
  t = nextScene(t.state, classify(3 * MIN, "unknown", "combat", 0.9, 0.3));
  assert.equal(t.notes.setting, "unknown: no change.");
  assert.match(t.notes.intensity, /combat ignored: only 30% confident/);
  const combat = nextScene(initialScene(0), classify(MIN, "tavern", "combat"));
  assert.match(combat.notes.intensity, /calm → combat at once \(90% confident\)/);
  const held = nextScene(combat.state, classify(MIN + 20_000, "tavern", "calm", 0.9, 0.95));
  assert.match(held.notes.intensity, /calm held back: combat lasts at least 60 s, 40 s to go/);
  assert.deepEqual(pendingChanges(held.state, MIN + 20_000), ["→ calm (1 of 2)", "combat stays at least 40 s more"]);
});

test("a confident combat result enters combat immediately; a hesitant one needs agreement", () => {
  assert.equal(run([classify(MIN, "tavern", "combat", 0.9, 0.7)]).state.intensity, "combat");
  const hesitant = run([classify(MIN, "tavern", "combat", 0.9, 0.55), classify(2 * MIN, "tavern", "combat", 0.9, 0.55)]);
  assert.deepEqual(hesitant.changes, [1]);
});

const SEC = 1000;

test("combat lasts at least a minute, even if the classifier is sure it's over", () => {
  const held = run([classify(0, "tavern", "combat"), classify(30 * SEC, "tavern", "calm", 0.9, 0.95)]);
  assert.equal(held.state.intensity, "combat");
});

test("one confident non-combat result ends combat after the minimum", () => {
  const { state, changes } = run([classify(0, "tavern", "combat"), classify(60 * SEC, "tavern", "calm", 0.9, 0.95)]);
  assert.deepEqual(changes, [0, 1]);
  assert.equal(state.intensity, "calm");
  assert.match(state.reason, /calm \(95% confident, combat over\)/);
});

test("leaving combat on hesitant results needs two in a row", () => {
  const { changes } = run([
    classify(0, "tavern", "combat"),
    classify(90 * SEC, "tavern", "calm", 0.9, 0.6),
    classify(120 * SEC, "tavern", "calm", 0.9, 0.6),
  ]);
  assert.deepEqual(changes, [0, 2]);
});

test("a confident non-combat result doesn't skip agreement outside combat", () => {
  const { changes } = run([classify(MIN, "tavern", "tense", 0.9, 0.95)]);
  assert.deepEqual(changes, []);
});

test("calm and tense changes need two agreeing results in a row", () => {
  assert.deepEqual(run([classify(MIN, "tavern", "tense"), classify(2 * MIN, "tavern", "tense")]).changes, [1]);
  // Interrupted by a different value: the streak restarts.
  const broken = run([classify(MIN, "tavern", "tense"), classify(2 * MIN, "tavern", "calm"), classify(3 * MIN, "tavern", "tense")]);
  assert.deepEqual(broken.changes, []);
});

test("setting changes need agreement and three minutes on the current setting", () => {
  const early = run([classify(1 * MIN, "town", "calm"), classify(2 * MIN, "town", "calm"), classify(3 * MIN, "town", "calm")]);
  assert.deepEqual(early.changes, [2]);
  assert.equal(early.state.setting, "town");
});

test("unknown and low-confidence results neither count towards nor reset a streak", () => {
  const { state, changes } = run([
    classify(3 * MIN, "dungeon", "calm"),
    classify(4 * MIN, "unknown", "calm"),
    classify(5 * MIN, "tavern", "calm", 0.3),
    classify(6 * MIN, "dungeon", "calm"),
  ]);
  assert.deepEqual(changes, [3]);
  assert.equal(state.setting, "dungeon");
});

test("a low-confidence intensity is ignored", () => {
  const { state } = run([classify(MIN, "tavern", "tense", 0.9, 0.2), classify(2 * MIN, "tavern", "tense", 0.9, 0.2)]);
  assert.equal(state.intensity, "calm");
});

test("a result matching the current scene resets pending changes", () => {
  const { changes } = run([
    classify(3 * MIN, "town", "tense"),
    classify(4 * MIN, "tavern", "calm"),
    classify(5 * MIN, "town", "tense"),
  ]);
  assert.deepEqual(changes, []);
});

test("setting and intensity changing together is one transition", () => {
  const { state, changes } = run([classify(3 * MIN, "dungeon", "tense"), classify(4 * MIN, "dungeon", "tense")]);
  assert.deepEqual(changes, [1]);
  assert.equal(state.setting, "dungeon");
  assert.equal(state.intensity, "tense");
  assert.match(state.reason, /dungeon.*tense/);
});

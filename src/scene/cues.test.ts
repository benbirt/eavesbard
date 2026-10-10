import assert from "node:assert/strict";
import { test } from "node:test";
import { callsForInitiative } from "./cues.js";

test("calling for initiative starts combat", () => {
  for (const text of [
    "Roll for initiative",
    "Role for initiative",
    "roll initiative!",
    "Okay everyone, roll for initiative. Three goblins leap out.",
    "The door bursts open. Everybody roll initiative",
    "Rolling initiative",
  ]) {
    assert.equal(callsForInitiative(text), true, text);
  }
});

test("talking about initiative doesn't", () => {
  for (const text of [
    "How does initiative work again?",
    "Do we roll for initiative?",
    "do we roll initiative",
    "Should I roll initiative with advantage",
    "My initiative bonus is plus three.",
    "The barkeep pours you an ale.",
  ]) {
    assert.equal(callsForInitiative(text), false, text);
  }
});

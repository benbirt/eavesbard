// The large scenario set (experiment E9, round 5): 232 scenes written by
// Claude and checked by the user, covering each kind of moment many times over (src/eval/large/).
// Every fourth scene is held out, so a classifier trained on the rest can be
// scored on scenes it hasn't seen.

import { COMBAT_ENDS_SET, COMBAT_SET } from "./large/combat.js";
import { COMBAT_STARTS_SET } from "./large/combat-starts.js";
import { OFF_TOPIC_SET } from "./large/off-topic.js";
import { OPENINGS } from "./large/openings.js";
import { SETTINGS_SET } from "./large/settings.js";
import { TENSE_SET } from "./large/tense.js";
import type { Scenario } from "./scenarios.js";

export const LARGE_SET: Scenario[] = [
  ...OPENINGS,
  ...SETTINGS_SET,
  ...TENSE_SET,
  ...COMBAT_STARTS_SET,
  ...COMBAT_SET,
  ...COMBAT_ENDS_SET,
  ...OFF_TOPIC_SET,
].map((s) => ({ ...s, name: `large: ${s.name}` }));

/** Whether a scene is held out from training. */
export const isHeldOut = (index: number) => index % 4 === 3;

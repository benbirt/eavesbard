// Runs scripted transcripts through the real classifier (same code and prompt
// as the page) and compares Haiku's answers with what we expect. Needs an API
// key; a full run costs well under a cent.
//
//   ANTHROPIC_API_KEY=... bazel run //scripts:classifier_check

import { classify, userMessage } from "../src/classify/classifier.js";
import type { Intensity, Setting } from "../src/library/scenes.js";

interface Scenario {
  name: string;
  scene: { setting: Setting; intensity: Intensity };
  /** [seconds ago, text], oldest first. */
  lines: [number, string][];
  /** Acceptable intensities. */
  expect: Intensity[];
}

const FIGHT: [number, string][] = [
  [140, "Roll for initiative. Three goblins leap out from behind the bar."],
  [125, "I go first. I swing my axe at the nearest one, that's an 18 to hit."],
  [110, "That hits. Roll damage. Eleven slashing, it's badly hurt."],
  [95, "The second goblin attacks you, 15 to hit, does that hit? Yes, take 6 piercing damage."],
  [80, "My turn, I cast magic missile at the hurt one. Three darts, it drops."],
];

const SCENARIOS: Scenario[] = [
  {
    name: "fight in progress",
    scene: { setting: "tavern", intensity: "combat" },
    lines: [...FIGHT, [40, "The last goblin snarls and stabs at the cleric. 12 to hit."], [20, "That misses. My turn, I attack again."]],
    expect: ["combat"],
  },
  {
    name: "fight just ended, looting",
    scene: { setting: "tavern", intensity: "combat" },
    lines: [...FIGHT, [45, "I finish off the last goblin. It collapses onto the table."], [25, "Okay, I search the bodies. Any loot?"], [10, "You find twelve silver pieces and a crude map."]],
    expect: ["calm", "tense"],
  },
  {
    name: "fight ended, short rest",
    scene: { setting: "tavern", intensity: "combat" },
    lines: [...FIGHT, [40, "That's the last of them. Combat is over."], [25, "Can we take a short rest? I want to spend hit dice."], [10, "Sure, the innkeeper peeks out from the cellar and thanks you."]],
    expect: ["calm"],
  },
  {
    name: "enemies fled, still wary",
    scene: { setting: "wilderness", intensity: "combat" },
    lines: [...FIGHT, [40, "The last two bandits drop their bows and run off into the trees."], [20, "We don't chase. We keep our weapons out and listen for more of them."]],
    expect: ["tense", "calm"],
  },
  {
    name: "rules question in the middle of a fight",
    scene: { setting: "dungeon", intensity: "combat" },
    lines: [...FIGHT, [30, "Wait, how do opportunity attacks work again? If I move away does it get a swing?"], [15, "Yes, one reaction. Okay, I stay and attack."]],
    expect: ["combat"],
  },
  {
    name: "initiative rules talk, no fight",
    scene: { setting: "tavern", intensity: "calm" },
    lines: [[60, "The barkeep pours you each an ale."], [40, "Before we start, how does initiative work again? Do we add dexterity?"], [25, "Yes, d20 plus your dex modifier."]],
    expect: ["calm"],
  },
];

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to run the classifier check.");
    process.exit(2);
  }
  let failures = 0;
  let cost = 0;
  for (const s of SCENARIOS) {
    const now = Date.now();
    const entries = s.lines.map(([ago, text]) => ({ at: now - ago * 1000, text }));
    const result = await classify({ apiKey, userText: userMessage(s.scene, 2 * 60_000, entries, now) });
    const c = result.classification;
    cost += result.costUsd ?? 0;
    const ok = s.expect.includes(c.intensity);
    if (!ok) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${s.name}: ${c.setting} (${c.settingConfidence.toFixed(2)}), ` +
        `${c.intensity} (${c.intensityConfidence.toFixed(2)}), expected ${s.expect.join(" or ")}. "${c.reason}"`,
    );
  }
  console.log(`\n${SCENARIOS.length - failures}/${SCENARIOS.length} as expected; cost $${cost.toFixed(4)}.`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

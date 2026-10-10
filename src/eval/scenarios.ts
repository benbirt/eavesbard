// Scripted scenes for checking classifiers (scripts/classifier-check.ts for
// Claude, src/eval/local-eval.ts for the local model). Each lists the
// answers we'd accept.

import type { Intensity, Setting } from "../library/scenes.js";

export type Category = "opening" | "setting" | "tense" | "combat" | "combat starts" | "combat ends" | "off-topic";

export interface Scenario {
  name: string;
  category?: Category;
  /** An opening-scene description, or a transcript with a current scene. */
  input:
    | { description: string }
    | { scene: { setting: Setting; intensity: Intensity }; lines: [secondsAgo: number, text: string][] };
  settings: (Setting | "unknown")[];
  intensities: Intensity[];
}

const FIGHT: [number, string][] = [
  [140, "Roll for initiative. Three goblins leap out from behind the bar."],
  [125, "I go first. I swing my axe at the nearest one, that's an 18 to hit."],
  [110, "That hits. Roll damage. Eleven slashing, it's badly hurt."],
  [95, "The second goblin attacks you, 15 to hit, does that hit? Yes, take 6 piercing damage."],
  [80, "My turn, I cast magic missile at the hurt one. Three darts, it drops."],
];

/** The development set: used while tuning, so its scores are optimistic. */
export const SCENARIOS: Scenario[] = [
  // Openings
  { name: "opening: underground caverns", input: { description: "underground caverns, exploring" }, settings: ["dungeon"], intensities: ["calm", "tense"] },
  { name: "opening: busy harbour", input: { description: "a busy harbour at dusk" }, settings: ["town"], intensities: ["calm"] },
  { name: "opening: haunted manor", input: { description: "a haunted manor at midnight" }, settings: ["interior"], intensities: ["tense"] },
  { name: "opening: market day", input: { description: "market day in a busy town" }, settings: ["town"], intensities: ["calm"] },
  { name: "opening: quiet inn", input: { description: "a quiet evening at the inn" }, settings: ["tavern"], intensities: ["calm"] },
  { name: "opening: storm at sea", input: { description: "a ship caught in a storm at sea" }, settings: ["travel", "wilderness"], intensities: ["tense"] },
  { name: "opening: goblin warren", input: { description: "sneaking through the goblin warren" }, settings: ["dungeon"], intensities: ["tense"] },
  { name: "opening: ambush on the road", input: { description: "the party is ambushed on the road" }, settings: ["travel", "wilderness"], intensities: ["combat"] },
  // Transcripts
  {
    name: "tavern chat",
    input: { scene: { setting: "town", intensity: "calm" }, lines: [[60, "We push open the door of the Prancing Pony and find a table by the fire."], [40, "The barkeep comes over. What can I get you? Ale, and a bowl of stew please."], [20, "I ask him if he's heard any rumours about the old mill."]] },
    settings: ["tavern"],
    intensities: ["calm"],
  },
  {
    name: "forest travel",
    input: { scene: { setting: "town", intensity: "calm" }, lines: [[60, "We leave the gates and follow the trail into the forest."], [40, "The trees close in overhead, birds singing, a stream runs alongside the path."], [20, "We keep walking until dusk and make camp in a clearing."]] },
    settings: ["wilderness", "travel"],
    intensities: ["calm"],
  },
  {
    name: "sneaking through a crypt",
    input: { scene: { setting: "dungeon", intensity: "calm" }, lines: [[50, "The stairs lead down into a crypt, rows of stone coffins either side."], [30, "We creep forward as quietly as we can. Stealth check. 14."], [15, "You hear something scraping behind one of the coffin lids."]] },
    settings: ["dungeon"],
    intensities: ["tense"],
  },
  {
    name: "fight in progress",
    input: { scene: { setting: "tavern", intensity: "combat" }, lines: [...FIGHT, [40, "The last goblin snarls and stabs at the cleric. 12 to hit."], [20, "That misses. My turn, I attack again."]] },
    settings: ["tavern", "unknown"],
    intensities: ["combat"],
  },
  {
    name: "fight just ended, looting",
    input: { scene: { setting: "tavern", intensity: "combat" }, lines: [...FIGHT, [45, "I finish off the last goblin. It collapses onto the table."], [25, "Okay, I search the bodies. Any loot?"], [10, "You find twelve silver pieces and a crude map."]] },
    settings: ["tavern", "unknown"],
    intensities: ["calm", "tense"],
  },
  {
    name: "fight ended, short rest",
    input: { scene: { setting: "tavern", intensity: "combat" }, lines: [...FIGHT, [40, "That's the last of them. Combat is over."], [25, "Can we take a short rest? I want to spend hit dice."], [10, "Sure, the innkeeper peeks out from the cellar and thanks you."]] },
    settings: ["tavern", "unknown"],
    intensities: ["calm"],
  },
  {
    name: "enemies fled, still wary",
    input: { scene: { setting: "wilderness", intensity: "combat" }, lines: [...FIGHT, [40, "The last two bandits drop their bows and run off into the trees."], [20, "We don't chase. We keep our weapons out and listen for more of them."]] },
    settings: ["wilderness", "unknown"],
    intensities: ["tense", "calm"],
  },
  {
    name: "rules question in a fight",
    input: { scene: { setting: "dungeon", intensity: "combat" }, lines: [...FIGHT, [30, "Wait, how do opportunity attacks work again? If I move away does it get a swing?"], [15, "Yes, one reaction. Okay, I stay and attack."]] },
    settings: ["dungeon", "unknown", "tavern"],
    intensities: ["combat"],
  },
  {
    name: "initiative rules talk, no fight",
    input: { scene: { setting: "tavern", intensity: "calm" }, lines: [[60, "The barkeep pours you each an ale."], [40, "Before we start, how does initiative work again? Do we add dexterity?"], [25, "Yes, d20 plus your dex modifier."]] },
    settings: ["tavern", "unknown"],
    intensities: ["calm"],
  },
];

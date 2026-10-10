// The local scene classifier (DESIGN.md 7.5, experiment E9b): the transcript
// is compared with short descriptions of each setting and intensity using the
// embedding model, and the similarities become a label and a confidence.
// No API key, no cost, runs on this computer.

import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import type { Classification } from "./classifier.js";

/** What each label sounds like at the table. Tuned against scripted scenarios. */
export const LABEL_DESCRIPTIONS: Record<Setting | Intensity | "offtopic", string[]> = {
  tavern: [
    "The barkeep pours ale at the inn; the tavern is warm and noisy with drinking and music.",
    "We rent rooms at the inn and sit by the hearth eating stew and drinking with the locals.",
    "A bard plays in the corner of the busy tavern while patrons gamble and talk.",
    "We push open the door of the pub and find a table by the fire.",
  ],
  town: [
    "We walk through the busy streets of the town, past the market stalls and the guards at the gate.",
    "The village square is crowded with merchants, townsfolk and a festival.",
    "We head down to the harbour and the docks of the city to find a ship.",
  ],
  interior: [
    "We enter the castle's great hall where the duke sits on his throne surrounded by courtiers.",
    "Inside the temple, priests chant before the altar and candles flicker.",
    "We search the wizard's library and study, full of old books and strange devices.",
    "The old manor house creaks; we creep along its dusty corridors and empty rooms.",
  ],
  wilderness: [
    "We travel through the dense forest, among the trees, with birds and a stream nearby.",
    "We climb the windswept mountain path and make camp under the stars.",
    "The swamp is thick with mist and insects as we wade through the marsh.",
    "We cross the desert dunes under the burning sun.",
  ],
  dungeon: [
    "We go down into the dungeon, torches flickering along the damp stone corridors.",
    "We explore the dark underground caverns and tunnels, water dripping from the cave ceiling.",
    "The crypt is full of tombs and bones; the ancient ruins are silent.",
    "We search the old mine shafts deep beneath the mountain.",
    "We crawl into the goblins' warren, a lair of cramped tunnels.",
  ],
  travel: [
    "We ride along the road for days on horseback and in the wagon, travelling to the next city.",
    "We set sail; the ship crosses the open sea for a week.",
    "The caravan journeys across the land; we keep moving towards our destination.",
    "On the road between towns, our wagon rolls along the highway.",
  ],
  calm: [
    "We rest, eat, chat and plan what to do next; nothing threatening is happening.",
    "We shop, haggle with the merchant and talk to the friendly locals.",
    "We explore and look around carefully, taking our time.",
    "A quiet evening; we relax and talk.",
    "The fight is over; we loot the bodies, search for treasure, heal up and take a short rest.",
    "Let's take a short rest and spend hit dice; we count our coins and share out the treasure.",
  ],
  tense: [
    "We sneak forward quietly; something is watching us and we hear a noise in the dark.",
    "Make a perception check; you sense danger, something is following you.",
    "The enemies have fled but we stay on guard with weapons drawn, listening for more.",
    "A tense negotiation; the guards look suspicious and hands move to weapons.",
    "The house is haunted; a ghostly whisper and footsteps echo at midnight.",
    "We sneak through the enemy's lair, trying not to be noticed.",
    "They run away; we don't chase them but keep our weapons ready in case they come back.",
  ],
  combat: [
    "Roll initiative! The goblins attack.",
    "I swing my sword at the orc, that's 17 to hit; roll damage, 9 slashing.",
    "It's your turn: the monster attacks you and you take 12 piercing damage.",
    "I cast fireball at the enemies; they make a dexterity saving throw.",
    "Bandits ambush us on the road and start shooting arrows at us.",
  ],
  offtopic: [
    "How does that rule work again? Do we add our modifier? Let me check the rulebook.",
    "Does anyone want pizza? I'll order food.",
    "What time do we need to finish tonight? When's the next session?",
    "Sorry, my phone was ringing. Where were we?",
  ],
};

export const LABEL_GROUPS = {
  // Off-topic talk is judged on the intensity axis only: game talk mentions
  // places too rarely for a setting score to tell it from real-world chat.
  setting: SETTINGS,
  intensity: [...INTENSITIES, "offtopic"] as const,
};

export function labelKey(label: string, i: number): string {
  return `label:${label}:${i}`;
}

/** Every label description as an embedding document. */
export function labelDocs(): { key: string; text: string }[] {
  return Object.entries(LABEL_DESCRIPTIONS).flatMap(([label, texts]) =>
    texts.map((text, i) => ({ key: labelKey(label, i), text })),
  );
}

export const ALL_LABEL_KEYS = labelDocs().map((d) => d.key);

/** Softmax temperature: similarities differ by a few hundredths between labels. */
const TEMPERATURE = 0.02;
/** Below this similarity to every setting, the setting is unknown. */
const MIN_SETTING_SIMILARITY = 0.54;

/**
 * Turns similarity scores for label descriptions (keyed by `labelKey`) into
 * a label and a confidence for one axis. Each label scores its best-matching
 * description. Returns `offtopic` when table talk wins.
 */
export function scoreAxis<L extends string>(
  labels: readonly L[],
  scores: ReadonlyMap<string, number>,
): { label: L; confidence: number; similarity: number } {
  const best = labels.map((label) => {
    let top = -1;
    for (const [key, score] of scores) if (key.startsWith(`label:${label}:`) && score > top) top = score;
    return { label, top };
  });
  const max = Math.max(...best.map((b) => b.top));
  const weights = best.map((b) => Math.exp((b.top - max) / TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  const winner = best.reduce((a, b) => (b.top > a.top ? b : a));
  return { label: winner.label, confidence: Math.exp(0) / total, similarity: winner.top };
}

/** Combines the two axes' scores into a classification. */
export function classifyFromScores(
  settingScores: ReadonlyMap<string, number>,
  intensityScores: ReadonlyMap<string, number>,
  current: { intensity: Intensity },
): Classification {
  const s = scoreAxis(LABEL_GROUPS.setting, settingScores);
  const i = scoreAxis(LABEL_GROUPS.intensity, intensityScores);
  const settingUnknown = s.similarity < MIN_SETTING_SIMILARITY;
  const offtopic = i.label === "offtopic";
  return {
    setting: settingUnknown ? "unknown" : (s.label as Setting),
    settingConfidence: settingUnknown ? 0 : s.confidence,
    // Table talk: keep the current intensity, with a confidence low enough to be ignored.
    intensity: offtopic ? current.intensity : (i.label as Intensity),
    intensityConfidence: offtopic ? 0 : i.confidence,
    reason:
      `closest descriptions: ${s.label} (similarity ${s.similarity.toFixed(2)}), ` +
      `${i.label} (similarity ${i.similarity.toFixed(2)})`,
  };
}

/** The last `words` words of some lines, for a query the model can take in. */
export function lastWords(lines: readonly string[], words: number): string {
  return lines.join(" ").split(/\s+/).filter(Boolean).slice(-words).join(" ");
}

/** The latest moment: the last two lines, at most `words` words. */
export function latest(lines: readonly string[], words = 30): string {
  return lastWords(lines.slice(-2), words);
}

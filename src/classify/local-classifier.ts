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
): { label: L; confidence: number; similarity: number; probs: Record<L, number> } {
  const best = labels.map((label) => {
    let top = -1;
    for (const [key, score] of scores) if (key.startsWith(`label:${label}:`) && score > top) top = score;
    return { label, top };
  });
  const max = Math.max(...best.map((b) => b.top));
  const weights = best.map((b) => Math.exp((b.top - max) / TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  const winner = best.reduce((a, b) => (b.top > a.top ? b : a));
  const probs = Object.fromEntries(best.map((b, i) => [b.label, weights[i]! / total])) as Record<L, number>;
  return { label: winner.label, confidence: Math.exp(0) / total, similarity: winner.top, probs };
}

/** An LLM's answer probabilities for each axis (see llm-prompt.ts). */
export interface LlmAnswer {
  model: string;
  setting: Record<Setting, number>;
  intensity: Record<Intensity, number>;
  /** Asked only during a fight: the probability that it's over. */
  fightOver?: number;
}

/**
 * How much the LLM counts in a blend, per axis, and how much its answers are
 * softened first (they're nearly always 0% or 100%). Tuned for Gemma 4 E2B
 * by cross-validation over all scenarios (experiments/E9.md, round 3).
 */
export const LLM_WEIGHT = { setting: 0.5, intensity: 0.5 };
export const LLM_TEMPERATURE = 2;
/**
 * During a fight, the LLM's "is it over?" answer ends it on its own above
 * this probability. It never ended a fight that was still going in the test sets,
 * whereas the embeddings read "combat over" as combat.
 */
export const FIGHT_OVER_THRESHOLD = 0.5;

/** The blend's settings; experiments pass their own (experiments/e9/analyse.mjs). */
export interface BlendOptions {
  weight: { setting: number; intensity: number };
  temperature: number;
  fightOverThreshold: number;
}

export const BLEND: BlendOptions = {
  weight: LLM_WEIGHT,
  temperature: LLM_TEMPERATURE,
  fightOverThreshold: FIGHT_OVER_THRESHOLD,
};

/** Raises probabilities to the power 1/T and renormalises. */
export function soften<L extends string>(probs: Record<L, number>, temperature: number): Record<L, number> {
  const raised = (Object.entries(probs) as [L, number][]).map(([l, p]) => [l, Math.pow(Math.max(p, 1e-12), 1 / temperature)] as const);
  const total = raised.reduce((sum, [, p]) => sum + p, 0);
  return Object.fromEntries(raised.map(([l, p]) => [l, p / total])) as Record<L, number>;
}

/**
 * Combines the two axes' scores into a classification, blended with an
 * LLM's answer if there is one.
 */
export function classifyFromScores(
  settingScores: ReadonlyMap<string, number>,
  intensityScores: ReadonlyMap<string, number>,
  current: { intensity: Intensity },
  llm?: LlmAnswer,
  options: BlendOptions = BLEND,
): Classification {
  const s = scoreAxis(LABEL_GROUPS.setting, settingScores);
  const i = scoreAxis(LABEL_GROUPS.intensity, intensityScores);
  const offtopic = i.label === "offtopic";
  if (llm) return blend(s, i, llm, current, offtopic, options);
  const settingUnknown = s.similarity < MIN_SETTING_SIMILARITY;
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

function blend(
  s: ReturnType<typeof scoreAxis<Setting>>,
  i: ReturnType<typeof scoreAxis<Intensity | "offtopic">>,
  llm: LlmAnswer,
  current: { intensity: Intensity },
  offtopic: boolean,
  options: BlendOptions,
): Classification {
  const mix = <L extends string>(labels: readonly L[], a: Record<L, number>, b: Record<L, number>, w: number) => {
    const soft = soften(b, options.temperature);
    return labels.map((label) => ({ label, p: (1 - w) * a[label] + w * soft[label] }));
  };
  const best = <L extends string>(xs: { label: L; p: number }[]) => xs.reduce((x, y) => (y.p > x.p ? y : x));
  // No "unknown" setting here: the LLM is told the current scene and keeps it when nothing changed.
  const setting = best(mix(SETTINGS, s.probs, llm.setting, options.weight.setting));
  const intensities = mix(INTENSITIES, i.probs, llm.intensity, options.weight.intensity);
  const intensity = best(intensities);
  const top = <L extends string>(d: Record<L, number>) =>
    (Object.entries(d) as [L, number][]).reduce((x, y) => (y[1] > x[1] ? y : x))[0];
  const llmSaid = `${llm.model}: ${top(llm.setting)}, ${top(llm.intensity)}`;

  if (current.intensity === "combat" && llm.fightOver !== undefined && llm.fightOver > options.fightOverThreshold) {
    const after = best(intensities.filter((x) => x.label !== "combat"));
    return {
      setting: setting.label,
      settingConfidence: setting.p,
      intensity: after.label,
      intensityConfidence: llm.fightOver,
      reason:
        `embeddings: ${s.label}, ${i.label}; ${llmSaid}, fight over (${Math.round(llm.fightOver * 100)}%); ` +
        `blended: ${setting.label}, ${after.label}`,
    };
  }
  return {
    setting: setting.label,
    settingConfidence: setting.p,
    // Table talk: keep the current intensity, with a confidence low enough to be ignored.
    intensity: offtopic ? current.intensity : intensity.label,
    intensityConfidence: offtopic ? 0 : intensity.p,
    reason:
      `embeddings: ${s.label}, ${i.label}; ${llmSaid}` +
      `${llm.fightOver !== undefined ? `, fight over (${Math.round(llm.fightOver * 100)}%)` : ""}; ` +
      `blended: ${setting.label}, ${offtopic ? "off-topic" : intensity.label}`,
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

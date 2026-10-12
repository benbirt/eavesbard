// Questions for a local instruction LLM (experiment E9, approach C). The
// model isn't asked to write anything: the answer is read from how likely it
// finds each label straight after "Answer:", one forward pass per axis.

import type { Intensity, Setting } from "../library/scenes.js";
import { lastWords } from "./local-classifier.js";

/** One-line meanings, shown to the model with the labels. */
export const LLM_SETTINGS: Record<Setting, string> = {
  tavern: "a tavern or inn",
  town: "a town, city, village or market, outdoors",
  interior: "inside a building that is not a tavern: castle, temple, mansion, shop, library",
  wilderness: "the wilderness: forest, mountains, swamp, desert, plains",
  dungeon: "a dungeon, cave, crypt, sewer, mine or ruin",
  travel: "on the road or at sea, journeying between places",
};

export const LLM_INTENSITIES: Record<Intensity, string> = {
  calm: "nothing threatening; talking, exploring, resting, shopping, or the players chatting about the game",
  tense: "danger is close but no fight yet: sneaking, a threat, a chase, a trap, a standoff",
  combat: "a fight is happening right now: initiative, attacks, damage, spells at enemies",
};

/** How much transcript each axis sees. */
const SETTING_WORDS = 300;
const INTENSITY_WORDS = 60;

export interface LlmQuestion {
  axis: "setting" | "intensity";
  /** The user message. */
  content: string;
  labels: string[];
}

export type LlmInput =
  | { description: string }
  | { lines: string[]; current: { setting: Setting; intensity: Intensity } };

/** The two questions (setting, then intensity) for a scene check. */
export function llmQuestions(input: LlmInput): [LlmQuestion, LlmQuestion] {
  let settingContext: string;
  let intensityContext: string;
  if ("description" in input) {
    settingContext = intensityContext = `The game master describes the opening scene: "${input.description}"`;
  } else {
    const now =
      `Until now the scene was: ${input.current.setting}, ${input.current.intensity}. ` +
      "Keep that answer unless the transcript shows it has changed.";
    const excerpt = (what: string, words: number) =>
      `The last ${what} of the transcript (speech recognition, may contain errors):\n"${lastWords(input.lines, words)}"\n\n${now}`;
    settingContext = excerpt("few minutes", SETTING_WORDS);
    intensityContext = excerpt("few lines", INTENSITY_WORDS);
  }
  return [
    question("setting", settingContext, "Where are the characters now?", LLM_SETTINGS),
    question("intensity", intensityContext, "How intense is the scene right now?", LLM_INTENSITIES),
  ];
}

/** Asked as well during a fight: the embeddings read "combat over" as combat. */
export const FIGHT_OVER_LABELS = {
  ongoing: "the fight is still going on: attacks, spells, enemies still standing",
  over: "the fight has ended: enemies dead, fled or surrendered; looting, healing, resting, talking, moving on",
};

/** "Is the fight still going on?", from the latest lines alone. */
export function fightOverQuestion(lines: string[]): LlmQuestion {
  const menu = Object.entries(FIGHT_OVER_LABELS)
    .map(([label, meaning]) => `- ${label}: ${meaning}`)
    .join("\n");
  return {
    axis: "intensity",
    content:
      "You are following a tabletop role-playing game (like D&D) from a speech transcript. A fight was going on.\n\n" +
      `The last few lines of the transcript (speech recognition, may contain errors):\n"${lastWords(lines, INTENSITY_WORDS)}"\n\n` +
      `Is the fight still going on right now?\n${menu}\n\nAnswer with one word from the list.`,
    labels: Object.keys(FIGHT_OVER_LABELS),
  };
}

function question(
  axis: LlmQuestion["axis"],
  context: string,
  ask: string,
  labels: Record<string, string>,
): LlmQuestion {
  const menu = Object.entries(labels)
    .map(([label, meaning]) => `- ${label}: ${meaning}`)
    .join("\n");
  return {
    axis,
    content:
      "You are following a tabletop role-playing game (like D&D) from a speech transcript.\n\n" +
      `${context}\n\n${ask}\n${menu}\n\nAnswer with one word from the list.`,
    labels: Object.keys(labels),
  };
}

/** Appended to the chat prompt; the labels are scored as its continuation. */
export const ANSWER_PREFIX = "Answer:";

/** Turns logits for the label alternatives into probabilities that sum to 1. */
export function labelProbabilities(logProbs: number[][]): number[] {
  // Each label may have several spellings (" dungeon", " Dungeon"): add their probabilities.
  const perLabel = logProbs.map(logSumExp);
  // NaN or infinite logits (e.g. 16-bit activations overflowing) mean the
  // model's answer is meaningless: fail rather than return a tie.
  if (perLabel.some((x) => !Number.isFinite(x))) throw new Error("the model produced invalid numbers (NaN or infinity)");
  const top = Math.max(...perLabel);
  const mass = perLabel.map((x) => Math.exp(x - top));
  const total = mass.reduce((a, b) => a + b, 0);
  return mass.map((m) => m / total);
}

function logSumExp(xs: number[]): number {
  const top = Math.max(...xs);
  if (!Number.isFinite(top)) return top;
  return top + Math.log(xs.reduce((sum, x) => sum + Math.exp(x - top), 0));
}

// --- Has a fight started or ended? (round 5, experiments/E9.md) ---

/** Yes/no questions about combat, asked according to the current scene. */
export const FIGHT_QUESTIONS = {
  started:
    "Has a fight started? Say yes if the game master has called for initiative, or someone in the story is attacking, being attacked or taking damage. Rules questions, plans, and stories about other fights don't count.",
  ended:
    "Has the fight ended? Say yes if the enemies are dead, have fled or surrendered, or the game master has said the fight is over.",
};

/** Calm against tense, asked as yes or no (E13: the three-way question heard calm play as tense). */
export const DANGER_QUESTION =
  "Is the party in danger or under threat right now: enemies close by, a hostile or tense encounter, sneaking or hiding, being watched or hunted, a chase, a trap, or exploring somewhere dangerous? Say no only if the characters are safe: talking among friends, planning, shopping, travelling, resting, eating or looting with no threat present, or the players are chatting about the game.";

/** The transcript, with the newest line apart from the earlier ones. */
export function transcriptBlock(lines: readonly string[], words: number): string {
  const newest = lines.at(-1) ?? "";
  const earlier = lastWords(lines.slice(0, -1), Math.max(0, words - newest.split(/\s+/).length));
  return (earlier ? `Earlier:\n"${earlier}"\n\n` : "") + `Just now:\n"${newest}"`;
}

/** A yes/no question about the transcript, given the scene so far. */
export function yesNoQuestion(current: { setting: Setting; intensity: Intensity }, lines: readonly string[], question: string): LlmQuestion {
  return {
    axis: "intensity",
    content:
      "You are following a tabletop role-playing game (like D&D) from a speech transcript (speech recognition, may contain errors).\n\n" +
      `The scene so far: ${current.setting}, ${current.intensity}.\n\n${transcriptBlock(lines, INTENSITY_WORDS)}\n\nQuestion: ${question}\nAnswer yes or no.`,
    labels: ["yes", "no"],
  };
}

/** "Has a fight started?" outside a fight, "has it ended?" during one. */
export function fightQuestion(lines: readonly string[], current: { setting: Setting; intensity: Intensity }): LlmQuestion {
  return yesNoQuestion(current, lines, current.intensity === "combat" ? FIGHT_QUESTIONS.ended : FIGHT_QUESTIONS.started);
}

/**
 * The intensity: the chance of combat from the fight question, and calm
 * against tense from the three-way question. The yes/no question catches
 * fights starting far more often; the three-way one is better at tension.
 */
export function mixIntensity(threeWay: Record<Intensity, number>, combat: number): Record<Intensity, number> {
  const rest = threeWay.calm + threeWay.tense;
  const calmShare = rest > 0 ? threeWay.calm / rest : 0.5;
  return { calm: (1 - combat) * calmShare, tense: (1 - combat) * (1 - calmShare), combat };
}

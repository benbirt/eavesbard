// Ways of asking an LLM about a scene, for comparing in the evaluation page
// (experiment E9). "current" is what the app does; the others are candidates.

import {
  ANSWER_PREFIX,
  FIGHT_QUESTIONS,
  fightOverQuestion,
  fightQuestion,
  LLM_INTENSITIES,
  LLM_SETTINGS,
  llmQuestions,
  mixIntensity,
} from "../classify/llm-prompt.js";
import { lastWords } from "../classify/local-classifier.js";
import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import type { LlmClient } from "../llm/llm-client.js";

export type VariantInput =
  | { description: string }
  | { lines: string[]; current: { setting: Setting; intensity: Intensity } };

export interface VariantAnswer {
  setting: Record<Setting, number>;
  intensity: Record<Intensity, number>;
  /** Only asked during a fight, by variants that ask it. */
  fightOver?: number;
}

export type Variant = (llm: LlmClient, input: VariantInput) => Promise<VariantAnswer>;

const asRecord = <L extends string>(labels: readonly L[], probs: number[]) =>
  Object.fromEntries(labels.map((l, i) => [l, probs[i] ?? 0])) as Record<L, number>;

const spaced = (labels: readonly string[]) => labels.map((l) => [` ${l}`, ` ${l[0]!.toUpperCase()}${l.slice(1)}`]);

/** The app's questions before round 5. */
const current: Variant = async (llm, input) => {
  const [s, i] = llmQuestions(input);
  const answer: VariantAnswer = {
    setting: asRecord(SETTINGS, await llm.ask(s.content, ANSWER_PREFIX, spaced(s.labels))),
    intensity: asRecord(INTENSITIES, await llm.ask(i.content, ANSWER_PREFIX, spaced(i.labels))),
  };
  if ("lines" in input && input.current.intensity === "combat") {
    const q = fightOverQuestion(input.lines);
    answer.fightOver = (await llm.ask(q.content, ANSWER_PREFIX, spaced(q.labels)))[1];
  }
  return answer;
};

/**
 * One question for both axes, framed around choosing the soundtrack, with a
 * JSON answer. The JSON is prefilled up to each value, setting first.
 */
export interface JsonOptions {
  /** Each label with its one-line meaning, rather than names only. */
  meanings: boolean;
  /** Say which soundtrack is playing. */
  withCurrent?: boolean;
  /** Say that table talk means keeping the current soundtrack. */
  offTopic?: boolean;
}

export function jsonPrompt(input: VariantInput, o: JsonOptions): string {
  const options = (d: Record<string, string>) =>
    o.meanings
      ? "\n" + Object.entries(d).map(([k, v]) => `- ${k}: ${v}`).join("\n")
      : Object.keys(d).join(", ");
  const what =
    "description" in input
      ? `Opening scene, as described by the game master: ${input.description}`
      : `Last 2.5 minutes of transcript:\n${input.lines.join("\n")}` +
        (o.withCurrent ? `\n\nThe soundtrack currently playing is for: ${input.current.setting}, ${input.current.intensity}.` : "") +
        (o.offTopic
          ? "\n\nIf the latest talk isn't about the game (rules lookups, dice, food, scheduling, real-world chat), " +
            "reply with the soundtrack that's playing."
          : "");
  return (
    "We're playing DnD. We need you to identify the current setting & intensity for another system to choose " +
    `the soundtrack which should currently play.\n\n${what}\n\n` +
    `Setting options: ${options(LLM_SETTINGS)}\nIntensity options: ${options(LLM_INTENSITIES)}\n\n` +
    'Please reply in JSON, i.e. {"setting": "<setting>", "intensity": "<intensity>"}'
  );
}

/** Gemma 4 writes JSON in a code fence, one key per line; the prefill matches what it writes. */
export const JSON_START = '```json\n{\n  "setting": "';

function jsonVariant(o: JsonOptions): Variant {
  return async (llm, input) => {
    const content = jsonPrompt(input, o);
    const setting = asRecord(SETTINGS, await llm.ask(content, JSON_START, SETTINGS.map((l) => [l])));
    const top = SETTINGS.reduce((a, b) => (setting[b] > setting[a] ? b : a));
    const intensity = asRecord(
      INTENSITIES,
      await llm.ask(content, `${JSON_START}${top}",\n  "intensity": "`, INTENSITIES.map((l) => [l])),
    );
    return { setting, intensity };
  };
}

/**
 * Background for the model (round 4): what it's for, and how a session
 * moves between calm, tense and combat. Written from general knowledge of the
 * game, not from the test scenes, and sent as a system message.
 */
export const BRIEF = `You are the music director for a live Dungeons & Dragons session. A microphone on the table gives you a speech-recognition transcript of what the game master and players say. It has recognition errors, no reliable punctuation, and crosstalk. Your answers choose the background music for the scene, so they should follow the story as it happens.

How the intensity of a scene changes:
- calm: talking, exploring, travelling, shopping, resting, with no danger close.
- tense: danger is close but nobody is fighting yet: a noise in the dark, a threat, sneaking past guards, a chase, a trap, a standoff.
- combat: a fight is happening. It starts when the game master calls for initiative ("roll for initiative", "roll initiative") or someone attacks. During a fight: attack rolls, damage, spells at enemies, whose turn it is.
- A fight ends when the enemies are dead, flee or surrender. Then the party loots, heals, rests or talks: back to calm, or tense if danger remains.
- Players often talk about things outside the story: rules questions (including how initiative works), dice maths, character sheets, snacks, scheduling, jokes. That talk doesn't change the scene.
- The setting changes when the party actually goes somewhere new, not when someone merely mentions a place.

The music should change promptly when the scene really changes, above all when a fight starts or ends, and otherwise stay put.`;

const ANCHOR = /Until now the scene was: (\w+), (\w+)\. Keep that answer unless the transcript shows it has changed\./;
const softer = (c: string) =>
  c.replace(ANCHOR, "The music playing now is for: $1, $2. Judge mainly from the latest lines whether the scene has changed.");

const REASON = 'First reason briefly about what is happening in the latest lines. Then give the answer on its own line as "Answer: <word>".';

/** What the model wrote for the latest scene, for the results file. */
export const thoughts: string[] = [];

interface Options {
  /** The brief as a system message. */
  brief?: boolean;
  /** The softer anchor. */
  soft?: boolean;
  /** Up to this many tokens of written reasoning, forced by starting the answer with "Reasoning:". */
  reason?: number;
  /** Up to this many tokens of Gemma 4's own thinking. */
  think?: number;
}

/**
 * The intensity question, after optional reasoning or thinking; the labels
 * are then scored as the app does, after "Answer:".
 */
async function intensityAfterThinking(llm: LlmClient, content: string, labels: string[], o: Options): Promise<number[]> {
  const system = o.brief ? BRIEF : undefined;
  if (o.reason) {
    const withReason = content.replace("Answer with one word from the list.", REASON);
    const written = await llm.generate(withReason, o.reason, "Reasoning:", { system });
    thoughts.push(written);
    const reasoning = written.split(/<turn\|>|\n?\**Answer:?/i)[0]!.trimEnd();
    return llm.ask(withReason, `Reasoning:${reasoning}\nAnswer:`, spaced(labels), { system });
  }
  if (o.think) {
    const written = await llm.generate(content, o.think, "", { system, thinking: true });
    thoughts.push(written);
    const end = written.indexOf("<channel|>");
    // If the thought ran out of budget, close it there.
    const thought = end >= 0 ? written.slice(0, end + "<channel|>".length) : `${written}\n<channel|>`;
    return llm.ask(content, `${thought}Answer:`, spaced(labels), { system, thinking: true });
  }
  return llm.ask(content, ANSWER_PREFIX, spaced(labels), { system });
}

/** The app's questions, reframed. Reasoning and thinking are only for intensity, where the model goes wrong most. */
function variant(o: Options): Variant {
  return async (llm, input) => {
    const [s, i] = llmQuestions(input);
    const edit = (c: string) => (o.soft ? softer(c) : c);
    return {
      setting: asRecord(SETTINGS, await llm.ask(edit(s.content), ANSWER_PREFIX, spaced(s.labels), { system: o.brief ? BRIEF : undefined })),
      intensity: asRecord(INTENSITIES, await intensityAfterThinking(llm, edit(i.content), i.labels, o)),
    };
  };
}

// --- Round 5: yes/no questions about change, chosen by the current scene ---

/** Questions about what has changed, each answered yes or no. */
export const CHANGE_QUESTIONS = {
  fightStarted: FIGHT_QUESTIONS.started,
  danger:
    "Are the characters in danger right now, even if nobody is fighting: a threat, a chase, sneaking past enemies, a trap, a standoff, something hunting them?",
  dangerPassed: "Has the danger passed, so the scene is calm again?",
  fightEnded: FIGHT_QUESTIONS.ended,
  moved:
    "Have the characters just arrived somewhere new or set off for somewhere new? Only count actually moving: talking about another place doesn't count.",
};

/** The transcript, with the newest line apart from the earlier ones. */
function transcriptBlock(lines: string[], words: number): string {
  const newest = lines.at(-1) ?? "";
  const earlier = lastWords(lines.slice(0, -1), Math.max(0, words - newest.split(/\s+/).length));
  return (earlier ? `Earlier:\n"${earlier}"\n\n` : "") + `Just now:\n"${newest}"`;
}

function yesNoPrompt(scene: { setting: Setting; intensity: Intensity }, transcript: string, question: string): string {
  return (
    "You are following a tabletop role-playing game (like D&D) from a speech transcript (speech recognition, may contain errors).\n\n" +
    `The scene so far: ${scene.setting}, ${scene.intensity}.\n\n${transcript}\n\nQuestion: ${question}\nAnswer yes or no.`
  );
}

/** A content-free transcript, for measuring the model's lean towards yes or no on each question. */
const NO_CONTENT = 'Just now:\n"N/A"';
const leanCache = new Map<string, number>();

/**
 * P(yes). With `calibrate`, corrected for the model's lean on the same
 * question about a content-free transcript (contextual calibration).
 */
async function yes(llm: LlmClient, scene: { setting: Setting; intensity: Intensity }, transcript: string, question: string, calibrate: boolean): Promise<number> {
  const p = (await llm.ask(yesNoPrompt(scene, transcript, question), ANSWER_PREFIX, spaced(["yes", "no"])))[0]!;
  if (!calibrate) return p;
  const key = `${scene.setting}/${scene.intensity}/${question}`;
  let lean = leanCache.get(key);
  if (lean === undefined) {
    lean = (await llm.ask(yesNoPrompt(scene, NO_CONTENT, question), ANSWER_PREFIX, spaced(["yes", "no"])))[0]!;
    leanCache.set(key, lean);
  }
  // Divide out the lean, so a content-free transcript would come out 50/50.
  const clamp = (x: number) => Math.min(1 - 1e-6, Math.max(1e-6, x));
  const y = clamp(p) / clamp(lean);
  const n = (1 - clamp(p)) / (1 - clamp(lean));
  return y / (y + n);
}

function changeVariant(calibrate: boolean): Variant {
  return async (llm, input) => {
    if ("description" in input) return current(llm, input);
    const scene = input.current;
    const ask = (words: number, q: string) => yes(llm, scene, transcriptBlock(input.lines, words), q, calibrate);
    const Q = CHANGE_QUESTIONS;
    const intensity = { calm: 0, tense: 0, combat: 0 } as Record<Intensity, number>;
    if (scene.intensity === "combat") {
      const ended = await ask(60, Q.fightEnded);
      const danger = await ask(60, Q.danger);
      intensity.combat = 1 - ended;
      intensity.tense = ended * danger;
      intensity.calm = ended * (1 - danger);
    } else {
      const started = await ask(60, Q.fightStarted);
      intensity.combat = started;
      if (scene.intensity === "calm") {
        const danger = await ask(60, Q.danger);
        intensity.tense = (1 - started) * danger;
        intensity.calm = (1 - started) * (1 - danger);
      } else {
        const passed = await ask(60, Q.dangerPassed);
        intensity.calm = (1 - started) * passed;
        intensity.tense = (1 - started) * (1 - passed);
      }
    }
    // Setting: stay unless they've moved; if they have, where to (the app's question, without the anchor).
    const moved = await ask(150, Q.moved);
    const [s] = llmQuestions(input);
    const where = asRecord(SETTINGS, await llm.ask(s.content.replace(ANCHOR_ANY, ""), ANSWER_PREFIX, spaced(s.labels)));
    const setting = Object.fromEntries(
      SETTINGS.map((x) => [x, moved * where[x] + (x === scene.setting ? 1 - moved : 0)]),
    ) as Record<Setting, number>;
    return { setting, intensity };
  };
}

const ANCHOR_ANY = /\n\nUntil now the scene was: [^\n]*/;

/** What the app asks (round 5): the current questions, with the chance of combat from "has a fight started / ended?". */
const mix: Variant = async (llm, input) => {
  const base = await current(llm, input);
  if ("description" in input) return base;
  const q = fightQuestion(input.lines, input.current);
  const yes = (await llm.ask(q.content, ANSWER_PREFIX, spaced(q.labels)))[0]!;
  return { ...base, intensity: mixIntensity(base.intensity, input.current.intensity === "combat" ? 1 - yes : yes) };
};

export const VARIANTS: Record<string, Variant> = {
  mix,
  change: changeVariant(false),
  "change-cal": changeVariant(true),
  current,
  brief: variant({ brief: true }),
  soft: variant({ soft: true }),
  "brief-soft": variant({ brief: true, soft: true }),
  "reason-64": variant({ reason: 64 }),
  "reason-160": variant({ reason: 160 }),
  "think-256": variant({ think: 256 }),
  "think-768": variant({ think: 768 }),
  "brief-reason-160": variant({ brief: true, reason: 160 }),
  "brief-think-256": variant({ brief: true, think: 256 }),
  "json-names": jsonVariant({ meanings: false }),
  "json-meanings": jsonVariant({ meanings: true }),
  "json-meanings-current": jsonVariant({ meanings: true, withCurrent: true }),
  "json-offtopic": jsonVariant({ meanings: true, withCurrent: true, offTopic: true }),
};

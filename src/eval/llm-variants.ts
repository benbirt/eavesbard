// Ways of asking an LLM about a scene, for comparing in the evaluation page
// (experiment E9). "current" is what the app does; the others are candidates.

import { ANSWER_PREFIX, fightOverQuestion, LLM_INTENSITIES, LLM_SETTINGS, llmQuestions } from "../classify/llm-prompt.js";
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

/** The app's questions (src/llm/scene-llm.ts). */
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

export const VARIANTS: Record<string, Variant> = {
  current,
  "json-names": jsonVariant({ meanings: false }),
  "json-meanings": jsonVariant({ meanings: true }),
  "json-meanings-current": jsonVariant({ meanings: true, withCurrent: true }),
  "json-offtopic": jsonVariant({ meanings: true, withCurrent: true, offTopic: true }),
};

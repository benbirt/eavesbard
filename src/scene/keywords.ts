// Instant combat detection from transcript text (DESIGN.md 7.4).

import { normalise } from "../stt/hallucination.js";

/**
 * Returns the first configured phrase found in `text`, or undefined. Matching
 * ignores case and punctuation, and tolerates small transcription slips: an
 * optional "for" ("roll initiative" / "roll for initiative") and a trailing
 * "s" on any word.
 */
export function findKeyword(text: string, phrases: readonly string[]): string | undefined {
  const plain = ` ${normalise(text)} `;
  return phrases.find((phrase) => pattern(phrase).test(plain));
}

const cache = new Map<string, RegExp>();

function pattern(phrase: string): RegExp {
  let re = cache.get(phrase);
  if (!re) {
    const words = normalise(phrase)
      .split(" ")
      .filter((w) => w !== "for")
      .map((w) => `${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?`);
    re = new RegExp(` ${words.join(" (?:for )?")} `);
    cache.set(phrase, re);
  }
  return re;
}

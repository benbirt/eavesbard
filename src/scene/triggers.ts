// Trigger phrases (DESIGN.md 7.4): hearing one makes the classifier run at
// once. They never change the scene themselves.

import { normalise } from "../stt/hallucination.js";

/** Flattens config/triggers.json's groups into one list, skipping comment keys. */
export function triggerPhrases(config: Record<string, unknown>): string[] {
  return Object.entries(config)
    .filter(([key, value]) => !key.startsWith("_") && Array.isArray(value))
    .flatMap(([, value]) => (value as unknown[]).filter((p): p is string => typeof p === "string"));
}

/**
 * Returns the first phrase found in `text` as whole words, ignoring case and
 * punctuation, or undefined.
 */
export function findTrigger(text: string, phrases: readonly string[]): string | undefined {
  const plain = ` ${normalise(text)} `;
  return phrases.find((phrase) => plain.includes(` ${normalise(phrase)} `));
}

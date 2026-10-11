// A quick guess at the opening scene from a description, by its words, for
// when the models aren't ready yet (DESIGN.md 7.6). The setting words are the
// tag map's own (the words and tags that put tracks in each setting).

import { SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import type { BucketRule, TagMap } from "../library/tag-map.js";
import { TAG_FACETS } from "../library/tracks-file.js";

/** Words that suggest an intensity, beyond the tag map's (which are mostly tag names). */
const INTENSITY_WORDS: Record<Exclude<Intensity, "calm">, string[]> = {
  combat: ["attack", "attacks", "ambush", "ambushes", "battle", "brawl", "fight", "fighting", "raid", "siege", "war", "combat", "skirmish"],
  tense: ["sneak", "sneaking", "stalk", "stalking", "chase", "chasing", "haunted", "hunt", "hunting", "trap", "traps", "danger", "threat", "spotted", "watched", "following", "lost"],
};

const wordsOf = (rule: BucketRule) => [...(rule.words ?? []), ...TAG_FACETS.flatMap((f) => rule[f] ?? [])].map((w) => w.toLowerCase());

/** Whether `token` is `word`, or its plural. */
const isWord = (token: string, word: string) => token === word || token === `${word}s` || token === `${word}es`;

/**
 * The setting with the most matching words, and an intensity if any word
 * suggests one (combat before tense); undefined parts weren't guessable.
 */
export function guessScene(description: string, map: TagMap): { setting?: Setting; intensity?: Intensity } {
  const tokens = description.toLowerCase().match(/[a-z']+/g) ?? [];
  const count = (words: string[]) => tokens.filter((t) => words.some((w) => isWord(t, w))).length;
  let setting: Setting | undefined;
  let best = 0;
  for (const s of SETTINGS) {
    const n = count(wordsOf(map.setting[s]));
    if (n > best) [setting, best] = [s, n];
  }
  const intensity = (["combat", "tense"] as const).find((i) => count(INTENSITY_WORDS[i]) > 0);
  // A recognised place with no sign of trouble: calm.
  return { setting, intensity: intensity ?? (setting ? "calm" : undefined) };
}

// Builders for the large scenario set (experiment E9, round 5). The scenes
// were written by Claude to cover each kind of moment many times over, in
// several transcript styles: Whisper-like (lower case, fillers, misheard
// words), Web Speech-like (no punctuation), and short single lines.

import type { Intensity, Setting } from "../../library/scenes.js";
import type { Category, Scenario } from "../scenarios.js";

export type S = Setting | "unknown";

export function opening(description: string, settings: S[], intensities: Intensity[]): Scenario {
  return { name: `opening: ${description}`, category: "opening", input: { description }, settings, intensities };
}

/** Lines are oldest first, `gap` seconds apart, the last one 5 seconds ago. */
export function talk(
  category: Category,
  name: string,
  current: [Setting, Intensity],
  lines: string[],
  settings: S[],
  intensities: Intensity[],
  gap = 15,
): Scenario {
  const n = lines.length;
  return {
    name,
    category,
    input: {
      scene: { setting: current[0], intensity: current[1] },
      lines: lines.map((text, i): [number, string] => [5 + (n - 1 - i) * gap, text]),
    },
    settings,
    intensities,
  };
}

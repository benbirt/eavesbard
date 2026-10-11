// CRD3 (Rameshkumar and Bailey, ACL 2020): Critical Role transcripts, with
// the Critical Role Wiki's episode summaries, CC BY-SA 4.0. The transcripts
// have no timestamps, so time is estimated from word count, and each turn is
// cut into short segments, about what speech-to-text would deliver. Shared by
// the replay (replay.mjs) and the labelling view, so both use the same clock.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Words per second of speech (150 a minute). */
export const WORDS_PER_SECOND = 2.5;
/** Longest segment, in words (about six seconds). */
const SEGMENT_WORDS = 15;

/** Clones the transcripts and summaries into `dir` (sparse, about 340 MB) unless there already. */
export function fetchCrd3(dir) {
  if (existsSync(join(dir, "data", "cleaned data"))) return;
  execFileSync("git", ["clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", "https://github.com/RevanthRameshkumar/CRD3", dir]);
  execFileSync("git", ["-C", dir, "sparse-checkout", "set", "data/cleaned data", "data/aligned data/c=2"]);
}

/**
 * An episode (e.g. "C2E005") as timed lines: start and duration in seconds,
 * the speaker (for the labelling view only), the text, and the turn number.
 */
export function crd3Lines(dir, episode) {
  const { TURNS } = JSON.parse(readFileSync(join(dir, "data", "cleaned data", `${episode}.json`), "utf8"));
  const lines = [];
  let t = 0;
  for (const turn of TURNS) {
    const words = turn.UTTERANCES.join(" ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += SEGMENT_WORDS) {
      const chunk = words.slice(i, i + SEGMENT_WORDS);
      const duration = chunk.length / WORDS_PER_SECOND;
      lines.push({ start: t, duration, speaker: turn.NAMES.join(", "), text: chunk.join(" "), turn: turn.NUMBER });
      t += duration;
    }
  }
  return lines;
}

/** The wiki summary sentences aligned to turn ranges (chunks of two sentences). */
export function crd3Alignment(dir, episode) {
  const file = join(dir, "data", "aligned data", "c=2", `${episode}_2_0.json`);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")).map((c) => ({
    summary: c.CHUNK,
    turnStart: c.ALIGNMENT["TURN START"],
    turnEnd: c.ALIGNMENT["TURN END"],
  }));
}

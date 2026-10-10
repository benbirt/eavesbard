// Local models for scene decisions and track picks (DESIGN.md 7.5, 7.7): one
// embedding index holding every track and every scene-label description.

import { ALL_LABEL_KEYS, classifyFromScores, labelDocs, lastWords, latest } from "./classify/local-classifier.js";
import type { Classification } from "./classify/classifier.js";
import { library } from "./library-data.js";
import type { Intensity } from "./library/scenes.js";
import { searchText } from "./library/track-text.js";
import { localModel, prepareEmbeddings, rank } from "./pick/embeddings.js";
import { trackKey } from "./pick/local-picker.js";

export { localModel };

export const LOCAL_MODEL_NAME = "local (bge-small)";

/** Starts downloading and indexing, once. */
export function prepareLocalModels(): Promise<void> {
  return prepareEmbeddings(() => [
    ...library.tracks.map((t) => ({ key: trackKey(t.track.id), text: searchText(t) })),
    ...labelDocs(),
  ]);
}

/**
 * Classifies a scene locally. The setting is judged from more of the
 * transcript than the intensity, which should follow the latest lines.
 */
export async function localClassify(
  input: { description: string } | { lines: string[]; current: { intensity: Intensity } },
): Promise<{ classification: Classification; latencyMs: number; queryText: string }> {
  await prepareLocalModels();
  const started = performance.now();
  const settingText = "description" in input ? input.description : lastWords(input.lines, 150);
  // The intensity follows the latest lines: a fight that just ended is still all over earlier ones.
  const intensityText = "description" in input ? input.description : latest(input.lines);
  const [settingRanked, intensityRanked] = await Promise.all([
    rank(settingText, ALL_LABEL_KEYS),
    rank(intensityText, ALL_LABEL_KEYS),
  ]);
  const toMap = (r: { key: string; score: number }[]) => new Map(r.map((x) => [x.key, x.score]));
  const classification = classifyFromScores(toMap(settingRanked), toMap(intensityRanked), {
    intensity: "description" in input ? "calm" : input.current.intensity,
  });
  return {
    classification,
    latencyMs: performance.now() - started,
    queryText:
      settingText === intensityText ? settingText : `Setting from: ${settingText}\n\nIntensity from: ${intensityText}`,
  };
}

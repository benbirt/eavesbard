// Local models for scene decisions and track picks (DESIGN.md 7.5, 7.7): one
// embedding index holding every track and every scene-label description.

import { ALL_LABEL_KEYS, classifyFromScores, labelDocs, lastWords, latest, type LlmAnswer } from "./classify/local-classifier.js";
import type { Classification } from "./classify/classifier.js";
import { library } from "./library-data.js";
import type { Intensity, Setting } from "./library/scenes.js";
import { askSceneLlm } from "./llm/scene-llm.js";
import { searchText } from "./library/track-text.js";
import { localModel, prepareEmbeddings, rank } from "./pick/embeddings.js";
import { trackKey } from "./pick/local-picker.js";
import { replaying } from "./replay-flag.js";

export { localModel };

export const LOCAL_MODEL_NAME = "local (bge-small)";

/** What each scene check was made from, kept only while replaying (experiments, E13). */
export const checkDetails: {
  at: number;
  current?: { setting: Setting; intensity: Intensity };
  setting: Record<string, number>;
  intensity: Record<string, number>;
  llm?: LlmAnswer;
}[] = [];

/** The local scene model's name, with the LLM that helped, if any. */
export const localModelName = (llm: string | undefined) => (llm ? `local (bge-small + ${llm})` : LOCAL_MODEL_NAME);

const prepare = () =>
  prepareEmbeddings(
    () => labelDocs(),
    () => library.tracks.map((t) => ({ key: trackKey(t.track.id), text: searchText(t) })),
  );

/**
 * Starts downloading and indexing, once. Resolves when scene checks can run:
 * the scene-label descriptions are indexed first, in a second or two.
 */
export function prepareLocalModels(): Promise<void> {
  return prepare().first;
}

/** Resolves when every track is indexed too, for local track picks. */
export function prepareTrackIndex(): Promise<void> {
  return prepare().all;
}

/**
 * Classifies a scene locally. The setting is judged from more of the
 * transcript than the intensity, which should follow the latest lines.
 * If a helper LLM is chosen and ready, its answer is blended in.
 */
export async function localClassify(
  input: { description: string } | { lines: string[]; current: { setting: Setting; intensity: Intensity } },
): Promise<{ classification: Classification; latencyMs: number; queryText: string; model: string }> {
  await prepareLocalModels();
  const started = performance.now();
  const settingText = "description" in input ? input.description : lastWords(input.lines, 150);
  // The intensity follows the latest lines: a fight that just ended is still all over earlier ones.
  const intensityText = "description" in input ? input.description : latest(input.lines);
  const [settingRanked, intensityRanked, llm] = await Promise.all([
    rank(settingText, ALL_LABEL_KEYS),
    rank(intensityText, ALL_LABEL_KEYS),
    // An LLM failure shouldn't stop the embeddings answering.
    askSceneLlm(input).catch(() => undefined),
  ]);
  const toMap = (r: { key: string; score: number }[]) => new Map(r.map((x) => [x.key, x.score]));
  const current = { intensity: "description" in input ? ("calm" as const) : input.current.intensity };
  const classification = classifyFromScores(toMap(settingRanked), toMap(intensityRanked), current, llm);
  // Replaying (experiments, E13): keep what this check was made from, so other blends can be tried offline.
  if (replaying) {
    checkDetails.push({
      at: Date.now(),
      current: "description" in input ? undefined : input.current,
      setting: Object.fromEntries(settingRanked.map((x) => [x.key, x.score])),
      intensity: Object.fromEntries(intensityRanked.map((x) => [x.key, x.score])),
      llm,
    });
  }
  return {
    classification,
    model: localModelName(llm?.model),
    latencyMs: performance.now() - started,
    queryText:
      settingText === intensityText ? settingText : `Setting from: ${settingText}\n\nIntensity from: ${intensityText}`,
  };
}

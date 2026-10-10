// Runs the scripted scenarios through the local scene classifier in a
// browser, for tuning (DESIGN.md 7.5). Not part of the site: built as
// //src:local_eval and loaded by a test page.

import { localClassify, prepareLocalModels } from "../local-models.js";
import { SCENARIOS } from "./scenarios.js";

declare global {
  interface Window {
    runLocalEval: () => Promise<{ name: string; ok: boolean; got: string; expected: string; reason: string }[]>;
  }
}

window.runLocalEval = async () => {
  await prepareLocalModels();
  const results = [];
  for (const s of SCENARIOS) {
    const { classification: c } = await localClassify(
      "description" in s.input
        ? s.input
        : { lines: s.input.lines.map(([, text]) => text), current: s.input.scene },
    );
    // A low-confidence intensity is ignored by the state machine, which keeps
    // the current one: score what the scene would actually become.
    const intensity =
      c.intensityConfidence < 0.5 && "scene" in s.input ? s.input.scene.intensity : c.intensity;
    results.push({
      name: s.name,
      ok: s.settings.includes(c.setting) && s.intensities.includes(intensity),
      got: `${c.setting} (${c.settingConfidence.toFixed(2)}), ${c.intensity} (${c.intensityConfidence.toFixed(2)})`,
      expected: `${s.settings.join("/")}, ${s.intensities.join("/")}`,
      reason: c.reason,
    });
  }
  return results;
};

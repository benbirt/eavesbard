// Runs scripted transcripts through the real classifier (same code and prompt
// as the page) and compares Haiku's answers with what we expect. Needs an API
// key; a full run costs well under a cent.
//
//   ANTHROPIC_API_KEY=... bazel run //scripts:classifier_check

import { classify, openingMessage, userMessage } from "../src/classify/classifier.js";
import { SCENARIOS } from "../src/eval/scenarios.js";

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to run the classifier check.");
    process.exit(2);
  }
  let failures = 0;
  let cost = 0;
  for (const s of SCENARIOS) {
    const now = Date.now();
    const userText =
      "description" in s.input
        ? openingMessage(s.input.description)
        : userMessage(
            s.input.scene,
            2 * 60_000,
            s.input.lines.map(([ago, text]) => ({ at: now - ago * 1000, text })),
            now,
          );
    const result = await classify({ apiKey, userText });
    const c = result.classification;
    cost += result.costUsd ?? 0;
    const ok = s.settings.includes(c.setting) && s.intensities.includes(c.intensity);
    if (!ok) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${s.name}: ${c.setting} (${c.settingConfidence.toFixed(2)}), ` +
        `${c.intensity} (${c.intensityConfidence.toFixed(2)}); expected ${s.settings.join("/")}, ` +
        `${s.intensities.join("/")}. "${c.reason}"`,
    );
  }
  console.log(`\n${SCENARIOS.length - failures}/${SCENARIOS.length} as expected; cost $${cost.toFixed(4)}.`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

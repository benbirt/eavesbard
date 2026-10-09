// The scene classifier (DESIGN.md 7.5): Claude Haiku over the Anthropic API,
// called directly from the browser with the user's own key.

import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import type { TranscriptEntry } from "../scene/transcript-buffer.js";
import { askJson, DEFAULT_MODEL } from "./api.js";
import type { Usage } from "./cost.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export { DEFAULT_MODEL };

export interface Classification {
  setting: Setting | "unknown";
  settingConfidence: number;
  intensity: Intensity;
  intensityConfidence: number;
  reason: string;
}

export interface ClassifyResult {
  classification: Classification;
  /** The user message that was sent, for the timeline and logs. */
  userText: string;
  usage: Usage;
  /** undefined if config/pricing.json has no price for the model. */
  costUsd: number | undefined;
  latencyMs: number;
}

const SETTING_VALUES = [...SETTINGS, "unknown"] as const;

/** Structured output schema: the API guarantees a response of this shape. */
export const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    setting: { type: "string", enum: SETTING_VALUES },
    setting_confidence: { type: "number" },
    intensity: { type: "string", enum: INTENSITIES },
    intensity_confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["setting", "setting_confidence", "intensity", "intensity_confidence", "reason"],
  additionalProperties: false,
} as const;

/** Parses and checks the model's JSON answer, throwing if it's malformed. */
export function parseClassification(text: string): Classification {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const setting = raw["setting"];
  const intensity = raw["intensity"];
  if (!(SETTING_VALUES as readonly unknown[]).includes(setting)) throw new Error(`Unexpected setting ${String(setting)}`);
  if (!(INTENSITIES as readonly unknown[]).includes(intensity)) throw new Error(`Unexpected intensity ${String(intensity)}`);
  return {
    setting: setting as Setting | "unknown",
    settingConfidence: confidence(raw["setting_confidence"]),
    intensity: intensity as Intensity,
    intensityConfidence: confidence(raw["intensity_confidence"]),
    reason: typeof raw["reason"] === "string" ? raw["reason"] : "",
  };
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) throw new Error(`Unexpected confidence ${String(value)}`);
  return Math.min(1, Math.max(0, value));
}

/** The message for choosing the opening scene from the game master's description. */
export function openingMessage(description: string): string {
  return (
    "This is the start of the session, so there is no current scene and no transcript yet. " +
    `The game master describes the opening scene as: "${description.trim()}"\n\n` +
    "Choose the setting and intensity that best fit that description."
  );
}

/** The per-request user message: the current scene, then the transcript window. */
export function userMessage(
  scene: { setting: Setting; intensity: Intensity },
  sceneForMs: number,
  entries: readonly TranscriptEntry[],
  now: number,
): string {
  const minutes = Math.round(sceneForMs / 60_000);
  const lines = entries.map((e) => {
    const ago = Math.max(0, Math.round((now - e.at) / 1000));
    return `[${ago}s ago] ${e.text}`;
  });
  return (
    `Current scene: setting ${scene.setting}, intensity ${scene.intensity} ` +
    `(for about ${minutes} minute${minutes === 1 ? "" : "s"}).\n\n` +
    `Transcript, oldest first:\n${lines.join("\n")}`
  );
}

/** Asks the model for a scene. `userText` comes from `userMessage` or `openingMessage`. */
export async function classify(options: { apiKey: string; model?: string; userText: string }): Promise<ClassifyResult> {
  const answer = await askJson({ ...options, system: SYSTEM_PROMPT, schema: OUTPUT_SCHEMA });
  return {
    classification: parseClassification(answer.text),
    userText: options.userText,
    usage: answer.usage,
    costUsd: answer.costUsd,
    latencyMs: answer.latencyMs,
  };
}

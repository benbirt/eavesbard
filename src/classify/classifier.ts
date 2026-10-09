// The scene classifier (DESIGN.md 7.5): Claude Haiku over the Anthropic API,
// called directly from the browser with the user's own key.

import Anthropic from "@anthropic-ai/sdk";
import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../library/scenes.js";
import type { TranscriptEntry } from "../scene/transcript-buffer.js";
import { costOf, priceOf, type Usage } from "./cost.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export const DEFAULT_MODEL = "claude-haiku-5-5";

export interface Classification {
  setting: Setting | "unknown";
  settingConfidence: number;
  intensity: Intensity;
  intensityConfidence: number;
  reason: string;
}

export interface ClassifyResult {
  classification: Classification;
  usage: Usage;
  /** undefined if config/pricing.json has no price for the model. */
  costUsd: number | undefined;
  latencyMs: number;
}

const SETTING_VALUES = [...SETTINGS, "unknown"] as const;

/** Structured output schema: the API guarantees a response of this shape. */
export const OUTPUT_SCHEMA = {
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

export async function classify(options: {
  apiKey: string;
  model?: string;
  scene: { setting: Setting; intensity: Intensity };
  sceneForMs: number;
  entries: readonly TranscriptEntry[];
  now: number;
}): Promise<ClassifyResult> {
  const model = options.model ?? DEFAULT_MODEL;
  // The key is the user's own, pasted into this page (DESIGN.md section 4).
  const client = new Anthropic({ apiKey: options.apiKey, dangerouslyAllowBrowser: true, timeout: 30_000 });
  const started = performance.now();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      // Room for adaptive thinking as well as the short JSON answer.
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: userMessage(options.scene, options.sceneForMs, options.entries, options.now) }],
    });
  } catch (err) {
    throw new Error(describeApiError(err));
  }
  const latencyMs = performance.now() - started;

  if (response.stop_reason === "refusal") throw new Error("The model declined to classify this transcript.");
  if (response.stop_reason === "max_tokens") throw new Error("The model ran out of tokens before answering.");
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("The model returned no answer.");

  return {
    classification: parseClassification(text),
    usage: response.usage,
    costUsd: costOf(response.usage, priceOf(model)),
    latencyMs,
  };
}

function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use the classifier model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API; will try again next time.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

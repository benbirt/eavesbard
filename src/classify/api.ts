// Shared plumbing for asking Claude for a JSON answer from the browser: the
// SDK client, a cached system prompt, structured output, cost and errors.

import Anthropic from "@anthropic-ai/sdk";
import { costOf, priceOf, type Usage } from "./cost.js";

export const DEFAULT_MODEL = "claude-haiku-5-5";

export interface JsonAnswer {
  /** The model's JSON text, matching `schema`. */
  text: string;
  usage: Usage;
  /** undefined if config/pricing.json has no price for the model. */
  costUsd: number | undefined;
  latencyMs: number;
}

export async function askJson(options: {
  apiKey: string;
  model?: string;
  /** Fixed text, cached: keep anything that varies per request out of it. */
  system: string;
  userText: string;
  schema: Record<string, unknown>;
}): Promise<JsonAnswer> {
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
      system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: { type: "json_schema", schema: options.schema } },
      messages: [{ role: "user", content: options.userText }],
    });
  } catch (err) {
    throw new Error(describeApiError(err));
  }
  const latencyMs = performance.now() - started;

  if (response.stop_reason === "refusal") throw new Error("The model declined to answer.");
  if (response.stop_reason === "max_tokens") throw new Error("The model ran out of tokens before answering.");
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("The model returned no answer.");
  return { text, usage: response.usage, costUsd: costOf(response.usage, priceOf(model)), latencyMs };
}

function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check it in Setup.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use the model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API; will try again next time.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

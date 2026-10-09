// The cost meter (DESIGN.md 7.5): API usage converted to dollars using
// config/pricing.json.

import pricingJson from "../../config/pricing.json" with { type: "json" };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** US dollars per million tokens. `cacheWrite` is the five-minute cache-write rate. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES = pricingJson as unknown as Record<string, Price>;

export function priceOf(model: string): Price | undefined {
  return model.startsWith("_") ? undefined : PRICES[model];
}

/** The dollar cost of one response's usage, or undefined if the model has no price. */
export function costOf(usage: Usage, price: Price | undefined): number | undefined {
  if (!price) return undefined;
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
    1e6
  );
}

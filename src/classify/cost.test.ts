import assert from "node:assert/strict";
import { test } from "node:test";
import { costOf, priceOf } from "./cost.js";

test("costs each kind of token at its own rate", () => {
  const price = { input: 1, output: 10, cacheRead: 0.1, cacheWrite: 1.25 };
  const cost = costOf(
    { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 800 },
    price,
  );
  assert.ok(Math.abs(cost! - (1000 + 1000 + 200 + 1000) / 1e6) < 1e-12);
});

test("knows Haiku's price and nothing it hasn't been told", () => {
  assert.ok(priceOf("claude-haiku-5-5"));
  assert.equal(priceOf("no-such-model"), undefined);
  assert.equal(priceOf("_comment"), undefined);
  assert.equal(costOf({ input_tokens: 1, output_tokens: 1 }, undefined), undefined);
});

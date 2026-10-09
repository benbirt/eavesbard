import assert from "node:assert/strict";
import { test } from "node:test";
import { crossfadeGains, ramp } from "./fade.js";

test("crossfade starts fully out and ends fully in", () => {
  assert.deepEqual(crossfadeGains(0), { out: 1, in: 0 });
  const end = crossfadeGains(1);
  assert.ok(Math.abs(end.out) < 1e-9);
  assert.equal(end.in, 1);
});

test("crossfade keeps constant power", () => {
  for (const p of [0.1, 0.25, 0.5, 0.9]) {
    const g = crossfadeGains(p);
    assert.ok(Math.abs(g.out ** 2 + g.in ** 2 - 1) < 1e-9);
  }
});

test("crossfade clamps progress", () => {
  assert.deepEqual(crossfadeGains(-1), crossfadeGains(0));
  assert.deepEqual(crossfadeGains(2), crossfadeGains(1));
});

test("ramp with zero duration jumps straight to the end", async () => {
  const seen: number[] = [];
  assert.equal(await ramp(0, (p) => seen.push(p)), true);
  assert.deepEqual(seen, [1]);
});

test("ramp rises monotonically to 1", async () => {
  const seen: number[] = [];
  assert.equal(await ramp(60, (p) => seen.push(p), undefined, 5), true);
  assert.equal(seen.at(-1), 1);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! >= seen[i - 1]!);
});

test("ramp stops when cancelled", async () => {
  let calls = 0;
  const done = await ramp(1000, () => calls++, () => calls >= 2, 5);
  assert.equal(done, false);
  assert.equal(calls, 2);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_RATE, Segmenter, type Segment } from "./segmenter.js";

const FRAME = 512; // 32 ms

/** Feeds frames with the given probabilities; returns the segments produced. */
function run(segmenter: Segmenter, probabilities: number[]): Segment[] {
  const out: Segment[] = [];
  probabilities.forEach((p, i) => {
    const frame = new Float32Array(FRAME).fill(i);
    const segment = segmenter.push(frame, p);
    if (segment) out.push(segment);
  });
  return out;
}

const repeat = (p: number, n: number) => Array<number>(n).fill(p);

test("silence produces nothing", () => {
  assert.deepEqual(run(new Segmenter(), repeat(0.1, 100)), []);
});

test("speech followed by enough silence becomes a padded segment", () => {
  const s = new Segmenter({ minSilenceMs: 320, padBeforeMs: 64, minSpeechMs: 100 });
  const segments = run(s, [...repeat(0.1, 10), ...repeat(0.9, 20), ...repeat(0.1, 10)]);
  assert.equal(segments.length, 1);
  const seg = segments[0]!;
  // Two frames of padding (64 ms) before speech starts at frame 10.
  assert.equal(seg.start, (8 * FRAME) / SAMPLE_RATE);
  // Includes the trailing silence that ended it.
  assert.equal(seg.audio.length, (2 + 20 + 10) * FRAME);
  assert.equal(seg.audio[0], 8);
  assert.equal(seg.end, seg.start + seg.audio.length / SAMPLE_RATE);
  assert.equal(s.speaking, false);
});

test("brief dips below the start threshold don't end speech", () => {
  const s = new Segmenter({ minSilenceMs: 320, minSpeechMs: 100 });
  const dips = [...repeat(0.9, 5), 0.4, 0.4, ...repeat(0.9, 5)];
  const segments = run(s, [...dips, ...repeat(0.1, 10)]);
  assert.equal(segments.length, 1);
});

test("short blips are dropped as noise", () => {
  const s = new Segmenter({ minSilenceMs: 320, minSpeechMs: 250 });
  assert.deepEqual(run(s, [0.9, 0.9, ...repeat(0.1, 20)]), []);
});

test("long speech is cut at the maximum length", () => {
  const s = new Segmenter({ maxSegmentMs: 1024, padBeforeMs: 0 });
  const segments = run(s, repeat(0.9, 70));
  assert.equal(segments.length, 2);
  assert.equal(segments[0]!.audio.length, 32 * FRAME);
  assert.equal(segments[1]!.start, segments[0]!.end);
});

test("flush ends a segment in progress", () => {
  const s = new Segmenter({ minSpeechMs: 100 });
  run(s, repeat(0.9, 10));
  assert.equal(s.speaking, true);
  assert.equal(s.flush()?.audio.length, 10 * FRAME);
  assert.equal(s.flush(), undefined);
});

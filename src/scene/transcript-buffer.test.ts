import assert from "node:assert/strict";
import { test } from "node:test";
import { TranscriptBuffer } from "./transcript-buffer.js";

test("keeps only the recent window and tracks new text", () => {
  const b = new TranscriptBuffer(1000);
  assert.equal(b.hasNewText, false);
  b.add({ at: 0, text: "old" });
  b.add({ at: 900, text: "new" });
  assert.equal(b.hasNewText, true);
  assert.deepEqual(b.window(1500).map((e) => e.text), ["new"]);
  b.markRead();
  assert.equal(b.hasNewText, false);
  b.clear();
  assert.deepEqual(b.window(1500), []);
});

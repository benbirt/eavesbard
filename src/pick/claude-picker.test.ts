import assert from "node:assert/strict";
import { test } from "node:test";
import type { LibraryTrack } from "../library/tag-map.js";
import { parsePick, pickerMessage, pickerSystemPrompt } from "./claude-picker.js";

function entry(id: number, title: string): LibraryTrack {
  return {
    track: {
      id,
      title,
      description: "Water drips in the dark.",
      genres: ["fantasy"],
      hasMusic: false,
      type: "ambience",
      tags: { civ: [], biome: ["underground"], mood: ["mysterious"], action: [] },
      keywords: [],
      file: `${id}`,
    },
    settings: ["dungeon"],
    intensities: ["tense"],
  };
}

const tracks = [entry(5, "Dripping Cave"), entry(9, "Old Mine")];

test("the system prompt lists every track and is stable between calls", () => {
  const prompt = pickerSystemPrompt(tracks);
  assert.match(prompt, /^5 \| Dripping Cave \| dungeon \| tense \| biome: underground; mood: mysterious "Water drips in the dark\."$/m);
  assert.match(prompt, /^9 \| Old Mine/m);
  assert.equal(pickerSystemPrompt(tracks), prompt);
});

test("the message gives the reason, scene, context and what to avoid", () => {
  const text = pickerMessage(
    {
      why: "opening scene",
      scene: { setting: "dungeon", intensity: "tense" },
      description: "underground caverns, exploring",
      transcript: [],
      playingId: 9,
      recentIds: [9],
    },
    tracks,
  );
  assert.match(text, /Why a track is needed: opening scene\./);
  assert.match(text, /setting dungeon, intensity tense/);
  assert.match(text, /"underground caverns, exploring"/);
  assert.match(text, /Recently played \(avoid\): 9 Old Mine\./);
});

test("only ids from the list are accepted", () => {
  assert.equal(parsePick('{"track_id":5,"reason":"caves"}', tracks).entry.track.id, 5);
  assert.throws(() => parsePick('{"track_id":7,"reason":"?"}', tracks), /isn't in the list/);
});

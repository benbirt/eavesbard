// Prints how config/tag-map.json sorts data/tracks.json, for tuning the map:
//
//   bazel run //scripts:library_report             # bucket sizes and unmapped tracks
//   bazel run //scripts:library_report -- town/tense   # the tracks in one bucket

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INTENSITIES, SETTINGS, type Intensity, type Setting } from "../src/library/scenes.js";
import { bucket, buildLibrary, parseTagMap } from "../src/library/tag-map.js";
import { parseTracksFile, TAG_FACETS, type IndexedTrack } from "../src/library/tracks-file.js";

const workspace = process.env["BUILD_WORKSPACE_DIRECTORY"] ?? process.cwd();
const read = (path: string): unknown => JSON.parse(readFileSync(resolve(workspace, path), "utf8"));
const tracks = parseTracksFile(read("data/tracks.json")).tracks;
const map = parseTagMap(read("config/tag-map.json"));
const library = buildLibrary(tracks, map);

const describe = (t: IndexedTrack): string => {
  const tags = TAG_FACETS.filter((f) => t.tags[f].length > 0).map((f) => `${f}: ${t.tags[f].join(", ")}`);
  return `${String(t.id).padStart(4)}  ${t.title}  [${tags.join("; ")}]`;
};

const only = process.argv[2];
if (only) {
  const [setting, intensity] = only.split("/") as [Setting, Intensity];
  if (!SETTINGS.includes(setting) || !INTENSITIES.includes(intensity)) {
    console.error(`Expected <setting>/<intensity>, e.g. town/tense`);
    process.exit(1);
  }
  for (const t of bucket(library, setting, intensity)) console.log(describe(t.track));
} else {
  console.log(
    `${tracks.length} tracks: ${library.outOfScope.length} out of scope, ` +
      `${library.unmapped.length} unmapped (limit ${map.maxUnmapped}), ${library.tracks.length} mapped.\n`,
  );
  console.log("".padEnd(12) + INTENSITIES.map((i) => i.padStart(8)).join(""));
  for (const s of SETTINGS) {
    console.log(s.padEnd(12) + INTENSITIES.map((i) => String(bucket(library, s, i).length).padStart(8)).join(""));
  }
  console.log("\nUnmapped:");
  for (const t of library.unmapped) console.log(describe(t));
}

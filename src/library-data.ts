// The track library, built at startup from the bundled index and tag map.

import tagMapJson from "../config/tag-map.json" with { type: "json" };
import tracksJson from "../data/tracks.json" with { type: "json" };
import { buildLibrary, parseTagMap } from "./library/tag-map.js";
import { parseTracksFile } from "./library/tracks-file.js";

const tracksFile = parseTracksFile(tracksJson as unknown);

export const library = buildLibrary(tracksFile.tracks, parseTagMap(tagMapJson as unknown));

/** When the bundled index last changed. */
export const indexGenerated = new Date(tracksFile.generated);

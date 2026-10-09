// Plain-text descriptions of tracks, for the track choosers (DESIGN.md 7.7).

import { TAG_FACETS } from "./tracks-file.js";
import type { LibraryTrack } from "./tag-map.js";

/** One line per track for the Claude picker's index. */
export function indexLine(entry: LibraryTrack): string {
  const t = entry.track;
  const tags = TAG_FACETS.filter((f) => t.tags[f].length > 0)
    .map((f) => `${f}: ${t.tags[f].join(", ")}`)
    .join("; ");
  const description = t.description ? ` "${t.description}"` : "";
  return `${t.id} | ${t.title} | ${entry.settings.join("/")} | ${entry.intensities.join("/")} | ${tags}${description}`;
}

/** A sentence-like description of a track, for embedding search. */
export function searchText(entry: LibraryTrack): string {
  const t = entry.track;
  const tags = TAG_FACETS.flatMap((f) => t.tags[f]);
  return [t.title, t.description.replace(/[.\s]+$/, ""), [...tags, ...t.keywords].join(", ")].filter(Boolean).join(". ");
}

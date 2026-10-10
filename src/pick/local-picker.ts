// The local track chooser (DESIGN.md 7.7): embedding search over the track
// list, run in a worker on this computer. No API key needed.

import type { LibraryTrack } from "../library/tag-map.js";
import { rank } from "./embeddings.js";
import type { PickRequest } from "./request.js";

export const trackKey = (id: number) => `track:${id}`;

/** What to search for: the description or the latest transcript, plus the scene. */
export function localQuery(request: PickRequest): string {
  const context = request.description ?? request.transcript.slice(-6).join(" ");
  return `${request.scene.setting}, ${request.scene.intensity}. ${context}`.trim();
}

export interface LocalPick {
  entry: LibraryTrack;
  score: number;
  query: string;
}

/** Ranks the allowed `choices` against the request and returns the best. */
export async function localPick(request: PickRequest, choices: readonly LibraryTrack[]): Promise<LocalPick> {
  const query = localQuery(request);
  const ranked = await rank(query, choices.map((c) => trackKey(c.track.id)));
  const best = ranked[0];
  const entry = best && choices.find((c) => trackKey(c.track.id) === best.key);
  if (!best || !entry) throw new Error("Local search found no track.");
  return { entry, score: best.score, query };
}

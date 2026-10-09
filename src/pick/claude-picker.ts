// The Claude track chooser (DESIGN.md 7.7): Haiku reads the whole track list,
// kept in a cached system prompt, and picks the track that best fits.

import { askJson, type JsonAnswer } from "../classify/api.js";
import type { LibraryTrack } from "../library/tag-map.js";
import { indexLine } from "../library/track-text.js";
import type { PickRequest } from "./request.js";

const INSTRUCTIONS = `You choose ambient music for a tabletop role-playing game (such as Dungeons & Dragons) while it is being played. The tracks are ten-minute ambiences from Tabletop Audio. Every track you may choose is listed below, one per line:

id | title | settings it suits | intensities it suits | tags | "description"

Settings: tavern, town, interior (castles, temples, libraries…), wilderness, dungeon (caves, crypts, mines, ruins…), travel. Intensities: calm, tense (danger near, no fight yet), combat (a fight under way).

You'll be told why a track is needed, the current scene (setting and intensity), and either the game master's description of the opening scene or the recent transcript of the table, which is automatic and full of errors. Choose the one track that would sound best right now:
1. It must suit the current intensity: never pick a calm-only track during combat, or a combat-only track when the party is calm.
2. Prefer tracks whose title, description and tags match the specific place and mood in the description or transcript (caverns, a harbour, a storm, a haunted house, a festival…), not just the broad setting. When nothing matches closely, pick a track that fits the setting and intensity well.
3. Avoid the recently played tracks you're given, unless nothing else fits.
4. Answer with the track's id and one short sentence saying why it fits.

Tracks:
`;

export interface Pick {
  entry: LibraryTrack;
  reason: string;
  answer: JsonAnswer;
  userText: string;
}

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { track_id: { type: "integer" }, reason: { type: "string" } },
  required: ["track_id", "reason"],
  additionalProperties: false,
};

let cached: { tracks: readonly LibraryTrack[]; system: string } | undefined;

/** The system prompt: instructions plus the whole index, built once so it caches. */
export function pickerSystemPrompt(tracks: readonly LibraryTrack[]): string {
  if (cached?.tracks !== tracks) cached = { tracks, system: INSTRUCTIONS + tracks.map(indexLine).join("\n") };
  return cached.system;
}

/** The per-request message describing the moment a track is needed for. */
export function pickerMessage(request: PickRequest, tracks: readonly LibraryTrack[]): string {
  const title = (id: number) => tracks.find((t) => t.track.id === id)?.track.title ?? "?";
  const parts = [
    `Why a track is needed: ${request.why}.`,
    `Current scene: setting ${request.scene.setting}, intensity ${request.scene.intensity}.`,
  ];
  if (request.description) parts.push(`The game master describes the opening scene as: "${request.description}"`);
  if (request.transcript.length > 0) {
    parts.push(`Recent transcript, oldest first:\n${request.transcript.map((line) => `- ${line}`).join("\n")}`);
  }
  if (request.playingId !== undefined) parts.push(`Now playing: ${request.playingId} ${title(request.playingId)}.`);
  if (request.recentIds.length > 0) {
    parts.push(`Recently played (avoid): ${request.recentIds.map((id) => `${id} ${title(id)}`).join("; ")}.`);
  }
  return parts.join("\n\n");
}

/** Parses the answer, checking the id is one we offered. */
export function parsePick(text: string, tracks: readonly LibraryTrack[]): { entry: LibraryTrack; reason: string } {
  const raw = JSON.parse(text) as { track_id?: unknown; reason?: unknown };
  const entry = tracks.find((t) => t.track.id === raw.track_id);
  if (!entry) throw new Error(`Claude chose track ${String(raw.track_id)}, which isn't in the list.`);
  return { entry, reason: typeof raw.reason === "string" ? raw.reason : "" };
}

export async function claudePick(apiKey: string, request: PickRequest, tracks: readonly LibraryTrack[]): Promise<Pick> {
  const userText = pickerMessage(request, tracks);
  const answer = await askJson({ apiKey, system: pickerSystemPrompt(tracks), userText, schema: SCHEMA });
  return { ...parsePick(answer.text, tracks), answer, userText };
}

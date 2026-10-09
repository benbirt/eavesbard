// Pure parsing for the track index generator. No network or file access, so
// it can be tested against invented fixtures.

import { parse } from "acorn";
import type { Expression, Node, Program, SpreadElement } from "acorn";
import { TAG_FACETS, type IndexedTrack, type TagFacet } from "../src/library/tracks-file.js";

/** What the homepage says about one track. */
export interface PageTrack {
  id: number;
  title: string;
  description: string;
  genres: string[];
  hasMusic: boolean;
  type: string;
  file: string;
}

const TILE_START = '<div class="col-md-3 mix';

/**
 * Parses the track tiles on the homepage. Tiles without a download link
 * (Patreon-only sneak peeks) are skipped, because there's no file to play.
 */
export function parseHomepage(html: string): PageTrack[] {
  const tracks: PageTrack[] = [];
  const tiles = html.split(TILE_START).slice(1);
  for (const tile of tiles) {
    const file = /saveAs\('([^']+)'\)/.exec(tile)?.[1];
    if (!file) continue;
    const classes = (/^([^"]*)"/.exec(tile)?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
    const id = Number(/id="keys_(\d+)"/.exec(tile)?.[1] ?? /data-track="song_(\d+)"/.exec(tile)?.[1]);
    const title = text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(tile)?.[1] ?? "");
    if (!Number.isInteger(id) || !title) throw new Error(`Couldn't read the id or title of the tile for ${file}`);
    tracks.push({
      id,
      title,
      // Partner tiles use "white flavor centerfy" and hold only promotional
      // text, so they deliberately get an empty description.
      description: cleanDescription(/<span class="white flavor">([\s\S]*?)<\/span>\s*(?:<div class="buttons">|<\/div>)/.exec(tile)?.[1] ?? ""),
      genres: classes.filter((c) => c !== "music"),
      hasMusic: classes.includes("music"),
      type: text(/<div class="track_title">[\s\S]*?<i[^>]*>([\s\S]*?)<\/i>/.exec(tile)?.[1] ?? ""),
      file,
    });
  }
  return tracks;
}

/** Removes the site's notes about Patreon-only alternate versions. */
function cleanDescription(html: string): string {
  return text(html).replace(/\s*\[[^\]]*(?:Patreon|Alternate|Alt\.)[^\]]*\]/gi, "").trim();
}

/** Strips tags, decodes common entities and collapses whitespace. */
export function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return String.fromCodePoint(n);
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/**
 * Reads the object literal assigned to `var <name> = {...}` in a script,
 * without running it. Only plain literals are accepted.
 */
export function readObjectLiteral(script: string, name: string): unknown {
  const program = parse(script, { ecmaVersion: "latest" }) as Program;
  for (const statement of program.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type === "Identifier" && declaration.id.name === name && declaration.init) {
        return literal(declaration.init);
      }
    }
  }
  throw new Error(`No "var ${name} = ..." found`);
}

function literal(node: Expression | SpreadElement | Node): unknown {
  switch (node.type) {
    case "Literal":
      return (node as Node & { value: unknown }).value;
    case "ArrayExpression":
      return (node as Node & { elements: (Expression | SpreadElement | null)[] }).elements.map((e) =>
        e ? literal(e) : null,
      );
    case "ObjectExpression": {
      const result: Record<string, unknown> = {};
      for (const prop of (node as Node & { properties: Node[] }).properties) {
        const p = prop as Node & { computed?: boolean; key?: Node & { name?: string; value?: unknown }; value?: Node };
        if (prop.type !== "Property" || p.computed || !p.key || !p.value) {
          throw new Error(`Unsupported object entry at offset ${prop.start}`);
        }
        const key = p.key.type === "Identifier" ? p.key.name : String(p.key.value);
        result[String(key)] = literal(p.value);
      }
      return result;
    }
    default:
      throw new Error(`Unsupported ${node.type} at offset ${node.start}: only plain literals are read`);
  }
}

/** Parses `useCaseTags` from tags_data.js into tag sets by track id. */
export function parseTags(script: string): Map<number, Record<TagFacet, string[]>> {
  const raw = readObjectLiteral(script, "useCaseTags");
  const result = new Map<number, Record<TagFacet, string[]>>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as Partial<Record<TagFacet, unknown>>;
    const tags = {} as Record<TagFacet, string[]>;
    for (const facet of TAG_FACETS) tags[facet] = cleanList(entry[facet]);
    result.set(Number(key), tags);
  }
  return result;
}

/** Parses `dictionary` from dictionary_a.js into keywords by track id. */
export function parseKeywords(script: string): Map<number, string[]> {
  const raw = readObjectLiteral(script, "dictionary");
  return new Map(Object.entries(raw as Record<string, unknown>).map(([key, value]) => [Number(key), cleanList(value)]));
}

/** Keeps the non-empty strings of a list, trimmed and without duplicates. */
function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items = value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  return [...new Set(items)];
}

export interface BuildResult {
  tracks: IndexedTrack[];
  /** Number of tracks on the page with no entry in tags_data.js. */
  untagged: number;
  /** Number of tracks on the page with no entry in dictionary_a.js. */
  withoutKeywords: number;
}

/** Joins the three sources into index entries, sorted by id. */
export function buildTracks(
  page: PageTrack[],
  tags: Map<number, Record<TagFacet, string[]>>,
  keywords: Map<number, string[]>,
): BuildResult {
  let untagged = 0;
  let withoutKeywords = 0;
  const tracks = page.map((track): IndexedTrack => {
    const trackTags = tags.get(track.id);
    if (!trackTags) untagged++;
    const trackKeywords = keywords.get(track.id);
    if (!trackKeywords) withoutKeywords++;
    return {
      ...track,
      tags: trackTags ?? { civ: [], biome: [], mood: [], action: [] },
      keywords: trackKeywords ?? [],
    };
  });
  tracks.sort((a, b) => a.id - b.id);
  return { tracks, untagged, withoutKeywords };
}

export interface CheckLimits {
  /** Fewer tracks than this means the page structure has changed. */
  minTracks: number;
  /** Largest allowed fraction of tracks missing from tags_data.js. */
  maxUntaggedFraction: number;
  /** Largest allowed drop in track count against the previous index. */
  maxDropFraction: number;
}

export const DEFAULT_LIMITS: CheckLimits = { minTracks: 100, maxUntaggedFraction: 0.05, maxDropFraction: 0.1 };

/** Returns the reasons this result must not replace the current index (empty if fine). */
export function checkResult(result: BuildResult, previousCount: number, limits = DEFAULT_LIMITS): string[] {
  const problems: string[] = [];
  const count = result.tracks.length;
  if (count < limits.minTracks) problems.push(`only ${count} tracks found (expected at least ${limits.minTracks})`);
  if (count > 0 && result.untagged / count > limits.maxUntaggedFraction) {
    problems.push(`${result.untagged} of ${count} tracks have no entry in tags_data.js`);
  }
  if (previousCount > 0 && count < previousCount * (1 - limits.maxDropFraction)) {
    problems.push(`track count fell from ${previousCount} to ${count}`);
  }
  const files = new Set<string>();
  for (const track of result.tracks) {
    if (files.has(track.file)) problems.push(`file ${track.file} is used by more than one track`);
    files.add(track.file);
  }
  return problems;
}

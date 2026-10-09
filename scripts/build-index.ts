// Generates data/tracks.json from tabletopaudio.com.
//
//   bazel run //scripts:build_index                       # fetch and write data/tracks.json
//   bazel run //scripts:build_index -- --from <dir>       # use saved index.html, tags_data.js, dictionary_a.js
//
// Exits non-zero, leaving the index untouched, if the scrape looks wrong.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTracksFile, type IndexedTrack, type TracksFile } from "../src/library/tracks-file.js";
import { buildTracks, checkResult, parseHomepage, parseKeywords, parseTags } from "./scrape.js";

const SITE = "https://tabletopaudio.com/";
const USER_AGENT = "eavesbard-index/0.1 (+https://github.com/benbirt/eavesbard)";

interface Sources {
  html: string;
  tagsScript: string;
  dictionaryScript: string;
}

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`);
  return response.text();
}

/** Finds a script's URL on the page by file name, keeping its cache-busting query. */
function scriptUrl(html: string, fileName: string): string {
  const src = new RegExp(`src="([^"]*/${fileName.replace(".", "\\.")}[^"]*)"`).exec(html)?.[1];
  if (!src) throw new Error(`The homepage no longer loads ${fileName}`);
  return new URL(src, SITE).href;
}

async function fetchSources(): Promise<Sources> {
  const html = await get(SITE);
  const [tagsScript, dictionaryScript] = await Promise.all([
    get(scriptUrl(html, "tags_data.js")),
    get(scriptUrl(html, "dictionary_a.js")),
  ]);
  return { html, tagsScript, dictionaryScript };
}

function readSources(dir: string): Sources {
  const read = (name: string) => readFileSync(join(dir, name), "utf8");
  return { html: read("index.html"), tagsScript: read("tags_data.js"), dictionaryScript: read("dictionary_a.js") };
}

function readPrevious(path: string): TracksFile | undefined {
  try {
    return parseTracksFile(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

function sameTracks(a: IndexedTrack[], b: IndexedTrack[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf("--from");
  // `bazel run` starts us in the runfiles tree; write to the real workspace.
  const workspace = process.env["BUILD_WORKSPACE_DIRECTORY"] ?? process.cwd();
  const outPath = resolve(workspace, "data/tracks.json");

  const sources = fromIndex >= 0 ? readSources(resolve(workspace, args[fromIndex + 1] ?? ".")) : await fetchSources();
  const result = buildTracks(
    parseHomepage(sources.html),
    parseTags(sources.tagsScript),
    parseKeywords(sources.dictionaryScript),
  );
  const previous = readPrevious(outPath);

  const problems = checkResult(result, previous?.tracks.length ?? 0);
  console.log(
    `Found ${result.tracks.length} tracks; ${result.untagged} without tags, ${result.withoutKeywords} without keywords.`,
  );
  if (problems.length > 0) {
    console.error(`Not writing ${outPath}:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }

  if (previous && sameTracks(previous.tracks, result.tracks)) {
    console.log("No changes.");
    return;
  }
  const file: TracksFile = { generated: new Date().toISOString(), source: SITE, tracks: result.tracks };
  parseTracksFile(file);
  writeFileSync(outPath, JSON.stringify(file, null, 2) + "\n");
  const before = previous?.tracks.length ?? 0;
  console.log(`Wrote ${outPath} (${before} -> ${result.tracks.length} tracks).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

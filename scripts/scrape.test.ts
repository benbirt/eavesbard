import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTracks,
  checkResult,
  parseHomepage,
  parseKeywords,
  parseTags,
  readObjectLiteral,
  text,
  type BuildResult,
} from "./scrape.js";

// Invented tiles in the shape of the homepage's markup.
const tile = (id: number, classes: string, title: string, flavor: string, file?: string, type = "ambience + music") => `
  <!--song ${id}-->
  <div class="col-md-3 mix ${classes}">
  <div class="track_title"><h3 class = "white">${title}</h3>
  <span style="display:block;"><i class = "white">${type}</i></span>
  <span  id="keys_${id}" style="display:none"></span></div>
  <div class="thumbnail">
  <div class="caption animated">
  <span class="white flavor">${flavor}</span>
  ${file ? `<div class="buttons"><span class="saveButton"><a href="javascript:" onclick="saveAs('${file}')">Save</a></span>
  <button data-track="song_${id}">Play</button></div>` : "</div>"}
  </div></div>`;

const PAGE = `<html><body><div id="Grid">
  ${tile(3, "music fantasy horror", "Haunted Mill", 'Wheels turn. [2 Alternate versions available for <a href="#">Patreon Patrons]</a>', "3_Haunted_Mill")}
  ${tile(2, "scifi", "Orbital Dock &amp; Bay", "Clanking <em>hulls</em>.", "2_Orbital_Dock", "ambience")}
  ${tile(4, "music historical", "Secret Tile", "Sneak peek for patrons.")}
  </div></body></html>`;

test("homepage tiles become tracks; tiles without a file are skipped", () => {
  const tracks = parseHomepage(PAGE);
  assert.deepEqual(tracks, [
    {
      id: 3,
      title: "Haunted Mill",
      description: "Wheels turn.",
      genres: ["fantasy", "horror"],
      hasMusic: true,
      type: "ambience + music",
      file: "3_Haunted_Mill",
    },
    {
      id: 2,
      title: "Orbital Dock & Bay",
      description: "Clanking hulls.",
      genres: ["scifi"],
      hasMusic: false,
      type: "ambience",
      file: "2_Orbital_Dock",
    },
  ]);
});

test("text strips tags and decodes entities", () => {
  assert.equal(text("A&#39;s <b>bold</b>&nbsp;&rsquo; &#x41; &unknown;"), "A's bold ’ A &unknown;");
});

const TAGS = `//Complete list of tags used below:
var useCaseTags = {
   "3": { // Haunted Mill
        civ: ["ruins"],
        biome: [""],
        mood: ["tension", "tension"],
        action: ["investigate"]
    },
    "2": { civ: [], biome: ["planar"], mood: [], action: [] },
};`;

const DICTIONARY = `var dictionary = {
    "3": ["mill","ghost"], //Haunted Mill
};
Object.size = function (obj) { return 0; };
document.getElementById("x").textContent = "ignored";`;

test("tag and keyword scripts are read without running them", () => {
  assert.deepEqual(parseTags(TAGS).get(3), { civ: ["ruins"], biome: [], mood: ["tension"], action: ["investigate"] });
  assert.deepEqual(parseKeywords(DICTIONARY).get(3), ["mill", "ghost"]);
});

test("readObjectLiteral refuses anything but plain literals", () => {
  assert.throws(() => readObjectLiteral("var x = { a: f() };", "x"), /only plain literals/);
  assert.throws(() => readObjectLiteral("var y = {};", "x"), /No "var x/);
});

test("sources are joined by id and sorted", () => {
  const result = buildTracks(parseHomepage(PAGE), parseTags(TAGS), parseKeywords(DICTIONARY));
  assert.deepEqual(
    result.tracks.map((t) => [t.id, t.keywords]),
    [
      [2, []],
      [3, ["mill", "ghost"]],
    ],
  );
  assert.equal(result.untagged, 0);
  assert.equal(result.withoutKeywords, 1);
});

test("checks reject suspicious scrapes", () => {
  const result = buildTracks(parseHomepage(PAGE), parseTags(TAGS), new Map());
  const limits = { minTracks: 1, maxUntaggedFraction: 0.05, maxDropFraction: 0.1 };
  assert.deepEqual(checkResult(result, 2, limits), []);
  assert.match(checkResult(result, 10, limits).join(), /fell from 10 to 2/);
  assert.match(checkResult(result, 0, { ...limits, minTracks: 5 }).join(), /only 2 tracks/);

  const untagged: BuildResult = buildTracks(parseHomepage(PAGE), new Map(), new Map());
  assert.match(checkResult(untagged, 0, limits).join(), /2 of 2 tracks have no entry/);

  const duplicate: BuildResult = { ...result, tracks: [...result.tracks, result.tracks[0]!] };
  assert.match(checkResult(duplicate, 0, limits).join(), /used by more than one track/);
});

// Experiment E12: candidate illustrations for each setting and intensity,
// from Wikimedia Commons, kept only if public domain or CC0 and large
// enough. Writes candidates.json and contact-sheet.html (tick the ones you
// like; the page lists your picks to paste back).
//   node contact-sheets.mjs
import { writeFileSync } from "node:fs";

const UA = "Eavesbard contact-sheet script (https://github.com/benbirt/eavesbard)";
const PER_CELL = 16;

/** Searches per setting and intensity: artists and works that suit each. */
const QUERIES = {
  "tavern/calm": ["Jan Steen inn interior", "Adriaen van Ostade tavern interior", "David Teniers tavern", "inn kitchen interior painting 17th century"],
  "tavern/tense": ["Adriaen Brouwer card players", "Hogarth gin lane", "smugglers tavern engraving", "tavern quarrel painting"],
  "tavern/combat": ["Adriaen Brouwer brawl", "peasants brawling tavern", "tavern fight engraving", "Jan Steen fight"],
  "town/calm": ["Gustave Doré London Pilgrimage", "Pieter Bruegel village", "medieval town market painting", "old town square painting 17th century"],
  "town/tense": ["Doré Whitechapel", "Doré London night", "night street engraving 19th century", "night watch lantern street painting"],
  "town/combat": ["siege of city engraving", "street fighting engraving", "Doré crusades siege", "sack of a city painting"],
  "interior/calm": ["Doré Idylls of the King hall", "great hall castle interior painting", "monastery library painting", "Pieter Neefs church interior"],
  "interior/tense": ["Piranesi interior", "crypt engraving", "gothic vault interior engraving", "Doré cathedral"],
  "interior/combat": ["Howard Pyle castle fight", "sword fight hall engraving", "Doré Don Quixote fight", "duel engraving"],
  "wilderness/calm": ["Albert Bierstadt mountains", "Caspar David Friedrich landscape", "Thomas Cole landscape", "John Bauer forest tarn"],
  "wilderness/tense": ["John Bauer troll", "Doré Little Red Riding Hood wolf", "Arnold Böcklin", "Ivan Shishkin forest", "storm in the mountains painting", "Doré Dante dark wood"],
  "wilderness/combat": ["Howard Pyle knights battle", "Paolo Uccello battle", "Doré Orlando Furioso", "medieval battle painting"],
  "dungeon/calm": ["Piranesi Carceri", "catacombs engraving", "cave interior painting", "grotto painting 19th century"],
  "dungeon/tense": ["Piranesi Carceri chains", "Doré Inferno", "Doré Paradise Lost Satan", "John Martin Pandemonium"],
  "dungeon/combat": ["Doré Inferno demons", "Doré Paradise Lost war in heaven", "Saint George and the dragon engraving", "dragon slaying painting"],
  "travel/calm": ["Turner calm sea ship", "caravan painting 19th century", "Aivazovsky ship calm", "road travellers painting 17th century"],
  "travel/tense": ["Doré Rime of the Ancient Mariner", "Aivazovsky storm", "Turner storm sea", "highwaymen engraving"],
  "travel/combat": ["sea battle painting age of sail", "Doré Orlando Furioso hippogriff", "highwaymen attack coach", "Howard Pyle pirates"],
};

async function api(params, tries = 4) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const body = res.ok ? await res.json() : undefined;
  if (body?.query) return body;
  // Rate limited or a transient error: wait and retry.
  if (tries > 1) {
    await sleep(3000);
    return api(params, tries - 1);
  }
  throw new Error(`Commons API failed for ${url}: ${res.status} ${JSON.stringify(body?.error ?? "")}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html = "") =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s*date\s*QS:\S+/gi, "") // Wikidata date markup
    .replace(/QS:\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
/** Titles that differ only in museum, edition or scan details count as the same work. */
const workKey = (title) =>
  title.toLowerCase().replace(/\.(jpe?g|png|tiff?)$/, "").replace(/\(.*?\)|,.*$|-.*?(museum|edition|google art project|lacma|rijksmuseum).*$/g, "").replace(/[^a-z]+/g, " ").trim();

const cells = {};
for (const [cell, queries] of Object.entries(QUERIES)) {
  const titles = [];
  for (const q of queries) {
    const r = await api({ action: "query", list: "search", srsearch: `${q} filetype:bitmap`, srnamespace: "6", srlimit: "10" });
    for (const s of r.query.search) if (!titles.includes(s.title)) titles.push(s.title);
    await sleep(200);
  }
  const info = await api({
    action: "query", prop: "imageinfo", titles: titles.slice(0, 50).join("|"),
    iiprop: "url|size|extmetadata", iiurlwidth: "480",
  });
  const picks = [];
  for (const page of info.query.pages) {
    const ii = page.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata ?? {};
    const licence = strip(meta.LicenseShortName?.value);
    if (!/public domain|^pd|cc0/i.test(licence)) continue;
    if (Math.max(ii.width, ii.height) < 1200) continue;
    picks.push({
      title: page.title.replace(/^File:/, ""),
      thumb: ii.thumburl,
      page: ii.descriptionurl,
      width: ii.width,
      height: ii.height,
      artist: strip(meta.Artist?.value).slice(0, 80),
      date: strip(meta.DateTimeOriginal?.value).slice(0, 40),
      licence,
    });
  }
  // Keep search order (relevance), drop repeat scans of the same work, then cap.
  picks.sort((a, b) => titles.indexOf("File:" + a.title) - titles.indexOf("File:" + b.title));
  const seen = new Set();
  const distinct = picks.filter((p) => !seen.has(workKey(p.title)) && seen.add(workKey(p.title)));
  cells[cell] = distinct.slice(0, PER_CELL).map((p, i) => ({ id: `${cell.replace("/", "-")}-${i + 1}`, ...p }));
  console.log(`${cell.padEnd(18)} ${titles.length} found, ${picks.length} public domain and large, kept ${cells[cell].length}`);
  await sleep(300);
}
writeFileSync(new URL("candidates.json", import.meta.url), JSON.stringify(cells, null, 1));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eavesbard art candidates</title>
<style>
  :root { color-scheme: light dark; --bg: #faf8f4; --fg: #1d1b18; --muted: #6b655c; --pick: #b5651d; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17150f; --fg: #eee8dc; --muted: #a59d8f; --card: #221f18; } }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; } h2 { margin: 32px 0 8px; text-transform: capitalize; }
  .muted { color: var(--muted); font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  label.card { display: block; background: var(--card); border: 3px solid transparent; border-radius: 6px; padding: 6px; cursor: pointer; }
  label.card:has(input:checked) { border-color: var(--pick); }
  label.card img { width: 100%; height: 180px; object-fit: cover; border-radius: 3px; display: block; background: #0002; }
  label.card input { margin-right: 4px; }
  .cap { font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }
  #picks { position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--muted); padding: 8px 0; }
  textarea { width: 100%; height: 3.5em; font: 12px ui-monospace, monospace; }
</style></head><body>
<h1>Art candidates</h1>
<p class="muted">Public-domain or CC0 images from Wikimedia Commons for each setting and intensity. Tick the ones you like (3–5 per group is plenty); click a title to see the full image and its licence. Your picks appear at the bottom: copy them back into the chat. Ticks are remembered in this browser.</p>
${Object.entries(cells).map(([cell, items]) => `<h2>${esc(cell.replace("/", " · "))} <span class="muted">(${items.length})</span></h2>
<div class="grid">${items.map((p) => `<label class="card"><img loading="lazy" src="${esc(p.thumb)}" alt="${esc(p.title)}">
<div class="cap"><input type="checkbox" value="${esc(p.id)}"><strong>${esc(p.id)}</strong> · <a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.title.slice(0, 70))}</a><br><span class="muted">${esc(p.artist)}${p.date ? " · " + esc(p.date) : ""} · ${esc(p.licence)}</span></div></label>`).join("\n")}</div>`).join("\n")}
<div id="picks"><span class="muted">Your picks (<span id="n">0</span>):</span><textarea readonly id="out"></textarea></div>
<script>
  const boxes = [...document.querySelectorAll('input[type=checkbox]')];
  let saved = []; try { saved = JSON.parse(localStorage.getItem('eavesbard-art-picks') || '[]'); } catch {}
  for (const b of boxes) b.checked = saved.includes(b.value);
  const update = () => {
    const picked = boxes.filter((b) => b.checked).map((b) => b.value);
    document.getElementById('out').value = picked.join(' ');
    document.getElementById('n').textContent = picked.length;
    try { localStorage.setItem('eavesbard-art-picks', JSON.stringify(picked)); } catch {}
  };
  for (const b of boxes) b.addEventListener('change', update);
  update();
</script></body></html>`;
writeFileSync(new URL("contact-sheet.html", import.meta.url), html);
console.log("wrote contact-sheet.html");

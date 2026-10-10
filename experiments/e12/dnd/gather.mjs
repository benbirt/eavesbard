// Experiment E12: official D&D art candidates per setting, from the Forgotten
// Realms Wiki's catalogue of published art. Keeps only art from Wizards of
// the Coast books and magazines (no video-game screenshots), large and
// landscape-shaped. Writes pool.json and pool.html (for hand-picking).
//   node gather.mjs
import { writeFileSync } from "node:fs";

const API = "https://forgottenrealms.fandom.com/api.php";
const UA = "Eavesbard art research (https://github.com/benbirt/eavesbard)";
const SETTINGS = {
  tavern: ["Images of taverns", "Images of inns"],
  town: ["Images of cities"],
  interior: ["Images of temples", "Images of castles", "Images of libraries"],
  wilderness: ["Images of forests", "Images of mountains", "Images of swamps", "Images of deserts"],
  dungeon: ["Images of dungeons", "Images of caves", "Images of the Underdark", "Images of ruins", "Images of sewers", "Images of tombs"],
  travel: ["Images of ships", "Images of roads"],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  for (let tries = 0; tries < 4; tries++) {
    const res = await fetch(`${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    await sleep(3000);
  }
  throw new Error("API failed");
}

async function members(category) {
  const out = [];
  let cont = {};
  do {
    const r = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${category}`, cmtype: "file", cmlimit: "500", ...cont });
    out.push(...r.query.categorymembers.map((m) => m.title));
    cont = r.continue ?? {};
    await sleep(300);
  } while (cont.cmcontinue);
  return out;
}

const field = (text, name) => (text.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n]*)`)) ?? [])[1]?.trim() ?? "";
const clean = (s) => s.replace(/\{\{Cite [^/]*\/([^|}]*)[^}]*\}\}/g, "$1").replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").replace(/''/g, "").trim();

const pool = {};
for (const [setting, cats] of Object.entries(SETTINGS)) {
  const titles = [...new Set((await Promise.all(cats.map(members))).flat())];
  const kept = [];
  for (let i = 0; i < titles.length; i += 50) {
    const r = await api({
      action: "query", titles: titles.slice(i, i + 50).join("|"),
      prop: "revisions|imageinfo", rvprop: "content", rvslots: "main", iiprop: "url|size", iiurlwidth: "480",
    });
    for (const p of r.query.pages) {
      const ii = p.imageinfo?.[0];
      const text = p.revisions?.[0]?.slots?.main?.content ?? "";
      if (!ii) continue;
      const source = field(text, "source");
      // Wizards' books and magazines only: no screenshots, video games or fan art.
      const fromBook = /\{\{Cite (book|adventure|dragon|dungeon|organized play|web\/D&D Beyond)/i.test(source) || /Cite book/i.test(text);
      if (!fromBook || /screenshot\s*=\s*yes|Images from video games|Category:Screenshots|fan ?art/i.test(text)) continue;
      if (ii.width < 1000 || ii.width / ii.height < 1.15) continue;
      kept.push({
        title: p.title.replace(/^File:/, ""),
        thumb: ii.thumburl, url: ii.url, page: ii.descriptionurl,
        width: ii.width, height: ii.height,
        source: clean(source), artist: clean(field(text, "author1")), description: clean(field(text, "description")).slice(0, 160),
      });
    }
    await sleep(300);
  }
  pool[setting] = kept.map((k, i) => ({ id: `${setting}-${i + 1}`, ...k }));
  console.log(`${setting.padEnd(11)} ${titles.length} files, ${kept.length} from books, large and landscape`);
}
writeFileSync(new URL("pool.json", import.meta.url), JSON.stringify(pool, null, 1));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
writeFileSync(new URL("pool.html", import.meta.url), `<!doctype html><meta charset="utf-8"><title>D&D art pool</title>
<style>body{font:13px system-ui;margin:12px;background:#fff}h2{margin:20px 0 6px}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.c img{width:100%;height:130px;object-fit:cover;display:block}.c{font-size:11px}</style>
${Object.entries(pool).map(([s, items]) => `<h2>${s} (${items.length})</h2><div class="g">${items.map((p) => `<div class="c"><img loading="eager" src="${esc(p.thumb)}"><b>${esc(p.id)}</b> ${esc(p.description.slice(0, 50))}</div>`).join("")}</div>`).join("")}`);

// Collects the chosen scene art from your own downloads: a local page with a
// slot per image, each linking to the image's page. Save the image there by
// hand (Save Image As…), then drop the file on its slot. Files land in art/
// (not committed until approved). Images are never fetched automatically:
// the wiki's terms forbid automated access.
//   node collect.mjs   → http://localhost:8770/
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const artDir = join(here, "art");
mkdirSync(artDir, { recursive: true });
const picks = JSON.parse(readFileSync(join(here, "picks.json"), "utf8"));
const chosen = Object.entries(picks).filter(([, p]) => p.verdict !== "down");
const slug = (cell) => cell.replace(/[^a-z]+/gi, "-").replace(/-+$/, "");
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const saved = (cell) => readdirSync(artDir).find((f) => f.startsWith(slug(cell) + "."));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page() {
  const cards = chosen.map(([cell, p]) => {
    const file = saved(cell);
    return `<article data-cell="${esc(cell)}" class="${file ? "done" : ""}">
<div class="drop">${file ? `<img src="/art/${esc(file)}?t=${Date.now()}" alt="">` : "Drop the saved image here<br><small>or click to choose a file</small>"}</div>
<input type="file" accept="image/*" hidden>
<h2>${esc(cell)}${p.caution ? ' <span class="warn">check the licence</span>' : ""}</h2>
<p><b>${esc(p.subject)}</b><br><span class="muted">${esc(p.book)}${p.artist ? " · " + esc(p.artist) : ""}</span></p>
${p.caution ? `<p class="muted">${esc(p.note)}</p>` : ""}
<p><a href="${esc(p.page)}" target="_blank" rel="noopener">Open page ↗</a>${file ? ' · <button class="clear" type="button">Remove</button>' : ""}</p>
</article>`;
  });
  const done = chosen.filter(([c]) => saved(c)).length;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scene art collection</title><style>
:root{color-scheme:light dark;--bg:#f6f3ee;--fg:#1d1b18;--muted:#6b655c;--card:#fff;--line:#d9d3c7}
@media (prefers-color-scheme:dark){:root{--bg:#16140f;--fg:#eee8dc;--muted:#a59d8f;--card:#221f18;--line:#3a352b}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
main{max-width:1300px;margin:0 auto} .muted{color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
article{background:var(--card);border-radius:8px;padding:10px;border:2px solid var(--line)} article.done{border-color:#3f8a52}
.drop{aspect-ratio:16/9;border:2px dashed var(--line);border-radius:6px;display:grid;place-items:center;text-align:center;cursor:pointer;color:var(--muted);overflow:hidden}
.drop.over{border-color:#b5651d;background:#b5651d22} .drop img{width:100%;height:100%;object-fit:cover}
h2{font-size:15px;margin:8px 0 4px} p{margin:4px 0}
.warn{font-size:11px;background:#c98a2b33;color:#a86412;padding:1px 6px;border-radius:8px;font-weight:500}
.clear{font:inherit;font-size:13px;background:none;border:none;color:#a8433a;cursor:pointer;padding:0}
</style></head><body><main>
<h1>Scene art: ${done} of ${chosen.length} saved</h1>
<p class="muted">For each slot: open its page, right-click the image, <b>Save Image As…</b>, then drop the saved file here. Everything is stored in experiments/e12/dnd/art on this Mac and isn't committed until you approve the set. Pick the largest version on the page (click through to the full-size file first if it offers one).</p>
<div class="grid">${cards.join("")}</div>
</main><script>
for (const a of document.querySelectorAll("article")) {
  const drop = a.querySelector(".drop"), input = a.querySelector("input");
  const send = async (file) => {
    if (!file || !file.type.startsWith("image/")) return alert("That isn't an image file.");
    const r = await fetch("/upload?cell=" + encodeURIComponent(a.dataset.cell) + "&type=" + encodeURIComponent(file.type), { method: "POST", body: file });
    if (!r.ok) return alert(await r.text());
    location.reload();
  };
  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => send(input.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over");
    if (!e.dataTransfer.files.length) return alert("Drop the saved file from Finder, not the image straight from the wiki: save it there first (Save Image As…).");
    send(e.dataTransfer.files[0]); });
  a.querySelector(".clear")?.addEventListener("click", async () => { await fetch("/remove?cell=" + encodeURIComponent(a.dataset.cell), { method: "POST" }); location.reload(); });
}
</script></body></html>`;
}

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const cell = url.searchParams.get("cell");
  const known = chosen.some(([c]) => c === cell);
  if (req.method === "GET" && url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page());
  if (req.method === "GET" && url.pathname.startsWith("/art/")) {
    const f = join(artDir, decodeURIComponent(url.pathname.slice(5)));
    if (!f.startsWith(artDir) || !existsSync(f)) return res.writeHead(404).end();
    return res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
  }
  if (req.method === "POST" && url.pathname === "/upload" && known) {
    const ext = EXT[url.searchParams.get("type")];
    if (!ext) return res.writeHead(400).end("Please use a JPEG, PNG or WebP image.");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const old = saved(cell);
    if (old) unlinkSync(join(artDir, old));
    writeFileSync(join(artDir, slug(cell) + ext), Buffer.concat(chunks));
    return res.writeHead(204).end();
  }
  if (req.method === "POST" && url.pathname === "/remove" && known) {
    const old = saved(cell);
    if (old) unlinkSync(join(artDir, old));
    return res.writeHead(204).end();
  }
  res.writeHead(404).end();
}).listen(8770, "127.0.0.1", () => console.log("http://localhost:8770/"));

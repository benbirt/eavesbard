// A local page for spot-checking the large scenario set's labels: each scene
// with the answers it accepts, and thumbs up or down with a note. Verdicts are
// saved to label-review.json as they're given.
//   bazel build //src:app && node label-review.mjs   (then open http://localhost:8771/)
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const { LARGE_SET } = await import(join(here, "../../bazel-bin/src/eval/large-set.js"));
const saved = join(here, "label-review.json");
const verdicts = existsSync(saved) ? JSON.parse(readFileSync(saved, "utf8")) : {};

const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Label review</title>
<style>
  body { font: 15px/1.45 system-ui, sans-serif; margin: 0 auto; max-width: 52rem; padding: 16px; background: #15171a; color: #e8e6e1; }
  h1 { font-size: 20px; } .muted { color: #9a978f; }
  .scene { border: 1px solid #333; border-radius: 10px; padding: 12px 14px; margin: 12px 0; background: #1d2024; }
  .scene.up { border-color: #4f8f6f; } .scene.down { border-color: #c0504a; }
  .head { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  .cat { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #9a978f; }
  .lines { margin: 8px 0; padding-left: 0; list-style: none; }
  .lines li { padding: 2px 0 2px 10px; border-left: 2px solid #444; margin: 2px 0; }
  .lines li:last-child { border-left-color: #e0a94a; }
  .want b { color: #7fb59c; }
  .row { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  button { font: inherit; border-radius: 8px; border: 1px solid #444; background: #2a2e33; color: inherit; padding: 4px 12px; cursor: pointer; }
  button[aria-pressed="true"].u { background: #2f5a45; } button[aria-pressed="true"].d { background: #6a2d2a; }
  input { flex: 1; min-width: 12rem; font: inherit; background: #111; color: inherit; border: 1px solid #444; border-radius: 8px; padding: 4px 8px; }
  .bar { position: sticky; top: 0; background: #15171a; padding: 8px 0; border-bottom: 1px solid #333; }
</style>
<div class="bar"><h1>Label review</h1><span id="count" class="muted"></span></div>
<p class="muted">Each scene shows the scene so far, the transcript (newest line last, in amber) and the answers I'd accept.
Thumbs down if any accepted answer is wrong or a right answer is missing; a note saying what you'd change helps. You can stop at any point: every click is saved.</p>
<div id="list"></div>
<script>
const verdicts = ${JSON.stringify(verdicts)};
const scenes = ${JSON.stringify(LARGE_SET)};
const list = document.getElementById("list");
const count = () => document.getElementById("count").textContent =
  Object.values(verdicts).filter((v) => v.ok !== undefined).length + " of " + scenes.length + " reviewed, " +
  Object.values(verdicts).filter((v) => v.ok === false).length + " thumbs down";
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
async function save(name, patch) {
  verdicts[name] = { ...verdicts[name], ...patch };
  await fetch("/verdict", { method: "POST", body: JSON.stringify({ name, ...verdicts[name] }) });
  count();
}
for (const s of scenes) {
  const v = verdicts[s.name] ?? {};
  const el = document.createElement("div");
  el.className = "scene" + (v.ok === true ? " up" : v.ok === false ? " down" : "");
  const before = "description" in s.input ? "opening description" : "scene so far: " + s.input.scene.setting + ", " + s.input.scene.intensity;
  const lines = "description" in s.input ? ["“" + s.input.description + "”"] : s.input.lines.map(([, t]) => t);
  el.innerHTML = '<div class="head"><span class="cat">' + esc(s.category) + '</span><strong>' + esc(s.name.replace(/^large: /, "")) + '</strong></div>' +
    '<div class="muted">' + esc(before) + '</div>' +
    '<ul class="lines">' + lines.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul>" +
    '<div class="want">Accept setting: <b>' + esc(s.settings.join(" or ").replace("unknown", "unchanged")) + '</b> · intensity: <b>' + esc(s.intensities.join(" or ")) + "</b></div>" +
    '<div class="row"><button class="u" aria-pressed="' + (v.ok === true) + '">👍</button><button class="d" aria-pressed="' + (v.ok === false) + '">👎</button>' +
    '<input placeholder="Note (optional)" value="' + esc(v.note ?? "").replace(/"/g, "&quot;") + '"></div>';
  const [up, down] = el.querySelectorAll("button");
  const set = (ok) => { up.setAttribute("aria-pressed", ok === true); down.setAttribute("aria-pressed", ok === false); el.className = "scene " + (ok ? "up" : "down"); save(s.name, { ok }); };
  up.onclick = () => set(true);
  down.onclick = () => set(false);
  el.querySelector("input").onchange = (e) => save(s.name, { note: e.target.value });
  list.append(el);
}
count();
</script>`;

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/verdict") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { name, ...v } = JSON.parse(body);
      verdicts[name] = v;
      writeFileSync(saved, JSON.stringify(verdicts, null, 2) + "\n");
      res.end("ok");
    });
    return;
  }
  res.writeHead(200, { "content-type": "text/html" }).end(page);
}).listen(8771, () => console.log("Label review on http://localhost:8771/"));

// Minimal static file server for local development: `bazel run //tools:serve`.
// localhost counts as a secure origin, so the mic and Cast work here too.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const [root = ".", port = "8080"] = process.argv.slice(2);
const types = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json", ".json": "application/json" };

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    statSync(file);
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(Number(port), "127.0.0.1", () => console.log(`Serving ${root} at http://localhost:${port}/`));

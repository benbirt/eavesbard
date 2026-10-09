// Adds a content hash to the bundle's URL in index.html (main.js -> main.js?v=<hash>),
// so a browser never pairs a new page with a cached old script.
//
//   node stamp-html.mjs <index.html> <main.js> <out.html>

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [htmlPath, scriptPath, outPath] = process.argv.slice(2);
const hash = createHash("sha256").update(readFileSync(scriptPath)).digest("hex").slice(0, 12);
const html = readFileSync(htmlPath, "utf8");
const stamped = html.replace('src="./main.js"', `src="./main.js?v=${hash}"`);
if (stamped === html) throw new Error(`No src="./main.js" found in ${htmlPath}`);
writeFileSync(outPath, stamped);

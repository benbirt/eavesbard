// Adds a version query to the bundle's URL in index.html (main.js -> main.js?v=<hash>),
// so a browser never pairs a new page with a cached old script. The hash
// covers every script the page loads; the page passes the same query on to
// its worker and worklet (src/assets.ts).
//
//   node stamp-html.mjs <index.html> <out.html> <script>...

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [htmlPath, outPath, ...scripts] = process.argv.slice(2);
const hash = createHash("sha256");
for (const script of scripts.sort()) hash.update(readFileSync(script));
const version = hash.digest("hex").slice(0, 12);
const html = readFileSync(htmlPath, "utf8");
const stamped = html.replace('src="./main.js"', `src="./main.js?v=${version}"`);
if (stamped === html) throw new Error(`No src="./main.js" found in ${htmlPath}`);
writeFileSync(outPath, stamped);

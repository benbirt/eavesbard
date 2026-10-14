// Writes the dashboard's insights (insights.ts) as JSON, for dashboard.tf.
//   node write-insights.js <out.json>

import { writeFileSync } from "node:fs";
import { INSIGHTS } from "./insights.js";

const [out] = process.argv.slice(2);
if (!out) throw new Error("usage: write-insights.js <out.json>");
writeFileSync(out, JSON.stringify(INSIGHTS, null, 2) + "\n");

// Runs each insight's query (insights.ts) through PostHog's query API, which
// checks it against PostHog's schema: `tofu plan` doesn't, so a malformed
// query would otherwise only fail at apply. Needs POSTHOG_API_KEY (query:read
// on the project).
//   bazel run //posthog:check_queries

import { INSIGHTS } from "./insights.js";

const API = "https://eu.posthog.com/api/projects/306168/query/";
const key = process.env.POSTHOG_API_KEY;
if (!key) throw new Error("POSTHOG_API_KEY isn't set");

let failed = false;
for (const [name, insight] of Object.entries(INSIGHTS)) {
  // The query API takes the query itself, not the InsightVizNode wrapping it for display.
  const response = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: insight.query.source }),
  });
  const body = (await response.json()) as { results?: unknown; detail?: string };
  if (response.ok && body.results !== undefined) console.log(`ok: ${name}`);
  else {
    console.log(`FAILED: ${name}: ${(body.detail ?? JSON.stringify(body)).slice(0, 400)}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);

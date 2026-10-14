#!/usr/bin/env bash
# Runs each insight's query (posthog/queries/*.json) through PostHog's query
# API, which validates it against PostHog's schema: `tofu plan` doesn't, so a
# malformed query would otherwise only fail at apply. Needs POSTHOG_API_KEY
# (query:read on the project).
#   posthog/check-queries.sh
set -o errexit -o nounset -o pipefail

API="https://eu.posthog.com/api/projects/306168/query/"
cd "$(dirname "$0")/queries"
failed=0
for file in *.json; do
  # The query API takes the query itself, not the InsightVizNode wrapping it for display.
  response=$(jq -c '{query: (if .kind == "InsightVizNode" then .source else . end)}' "$file" |
    curl --silent --show-error --header "Authorization: Bearer $POSTHOG_API_KEY" \
      --header "Content-Type: application/json" --data @- "$API")
  if jq -e 'has("results")' <<<"$response" >/dev/null; then
    echo "ok: $file"
  else
    echo "FAILED: $file: $(jq -r '.detail // .' <<<"$response" | head -c 400)"
    failed=1
  fi
done
exit "$failed"

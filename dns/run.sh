#!/usr/bin/env bash
# Plans or applies the DNS records from this computer, with the Cloudflare
# token from KDE Wallet (stored with secret-tool, see DESIGN.md 8). CI
# normally applies them, on pushes to main; this is for trying a change first.
#   dns/run.sh plan|apply|records
# `records` lists every record in the zones (eavesbard.com, eavesbard.app) and
# their redirect rules, with the zones', records' and rules' IDs, as
# Cloudflare's API returns them.
set -o errexit -o nounset -o pipefail

secret() { nix shell nixpkgs#libsecret --command secret-tool lookup "$@"; }

CLOUDFLARE_API_TOKEN=$(secret service cloudflare token eavesbard-tofu)
export CLOUDFLARE_API_TOKEN

api() {
  curl --silent --show-error --fail-with-body \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/$1"
}

case "${1:-}" in
  plan | apply)
    keys=$("$(dirname "$0")/../tools/r2-keys.sh")
    while IFS='=' read -r name value; do export "$name=$value"; done <<<"$keys"
    exec bazel run "//dns:dns.$1"
    ;;
  records)
    for zone in eavesbard.com eavesbard.app; do
      zone_id=$(api "zones?name=$zone" | jq --raw-output '.result[0].id')
      echo "# $zone: zone_id = $zone_id"
      api "zones/$zone_id/dns_records?per_page=1000" |
        jq --raw-output '.result[] | [.id, .type, .name, .content, .ttl, .proxied, .comment // ""] | @tsv'
      # Its redirect rules (Single Redirects), if it has any: Cloudflare
      # answers 404 for a zone without them.
      echo "# $zone: redirect rules"
      if rules=$(api "zones/$zone_id/rulesets/phases/http_request_dynamic_redirect/entrypoint" 2>&1); then
        jq '.result | {id, rules}' <<<"$rules"
      else
        echo "$rules"
      fi
    done
    ;;
  *)
    echo "usage: $0 plan|apply|records" >&2
    exit 2
    ;;
esac

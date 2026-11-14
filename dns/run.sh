#!/usr/bin/env bash
# Plans or applies the DNS records from this computer, with the keys from KDE
# Wallet (stored with secret-tool, see DESIGN.md 8). CI normally applies them,
# on pushes to main; this is for trying a change first.
#   dns/run.sh plan|apply|records
# `records` lists every record in the zone, with the zone's and the records'
# IDs, as Cloudflare's API returns them.
set -o errexit -o nounset -o pipefail

secret() { nix shell nixpkgs#libsecret --command secret-tool lookup "$@"; }

CLOUDFLARE_API_TOKEN=$(secret service cloudflare zone eavesbard.com)
export CLOUDFLARE_API_TOKEN

api() {
  curl --silent --show-error --fail-with-body \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/$1"
}

case "${1:-}" in
  plan | apply)
    AWS_ACCESS_KEY_ID=$(secret service r2 bucket eavesbard-tofu-state field access-key-id)
    AWS_SECRET_ACCESS_KEY=$(secret service r2 bucket eavesbard-tofu-state field secret-access-key)
    export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
    exec bazel run "//dns:dns.$1"
    ;;
  records)
    zone_id=$(api "zones?name=eavesbard.com" | jq --raw-output '.result[0].id')
    echo "zone_id = $zone_id"
    api "zones/$zone_id/dns_records?per_page=1000" |
      jq --raw-output '.result[] | [.id, .type, .name, .content, .ttl, .proxied, .comment // ""] | @tsv'
    ;;
  *)
    echo "usage: $0 plan|apply|records" >&2
    exit 2
    ;;
esac

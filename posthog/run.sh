#!/usr/bin/env bash
# Plans or applies the PostHog configuration from this computer, with the keys
# from KDE Wallet (stored with secret-tool, see DESIGN.md 7.11). CI normally
# applies it, on pushes to main; this is for trying a change first.
#   posthog/run.sh plan|apply|check-queries
set -o errexit -o nounset -o pipefail

secret() { nix shell nixpkgs#libsecret --command secret-tool lookup "$@"; }

POSTHOG_API_KEY=$(secret service posthog project 306168)
CLOUDFLARE_API_TOKEN=$(secret service cloudflare token eavesbard-tofu)
export POSTHOG_API_KEY CLOUDFLARE_API_TOKEN

case "${1:-}" in
  plan | apply)
    keys=$("$(dirname "$0")/../tools/r2-keys.sh")
    while IFS='=' read -r name value; do export "$name=$value"; done <<<"$keys"
    exec bazel run "//posthog:posthog.$1"
    ;;
  check-queries) exec bazel run //posthog:check_queries ;;
  *)
    echo "usage: $0 plan|apply|check-queries" >&2
    exit 2
    ;;
esac

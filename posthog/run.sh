#!/usr/bin/env bash
# Plans or applies the PostHog configuration from this computer, with the keys
# from KDE Wallet (stored with secret-tool, see DESIGN.md 7.11). CI normally
# applies it, on pushes to main; this is for trying a change first.
#   posthog/run.sh plan|apply|check-queries
set -o errexit -o nounset -o pipefail

secret() { nix shell nixpkgs#libsecret --command secret-tool lookup "$@"; }

POSTHOG_API_KEY=$(secret service posthog project 306168)
AWS_ACCESS_KEY_ID=$(secret service r2 bucket eavesbard-tofu-state field access-key-id)
AWS_SECRET_ACCESS_KEY=$(secret service r2 bucket eavesbard-tofu-state field secret-access-key)
export POSTHOG_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

case "${1:-}" in
  plan | apply) exec bazel run "//posthog:posthog.$1" ;;
  check-queries) exec "$(dirname "$0")/check-queries.sh" ;;
  *)
    echo "usage: $0 plan|apply|check-queries" >&2
    exit 2
    ;;
esac

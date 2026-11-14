#!/usr/bin/env bash
# Prints the S3 keys for the R2 state bucket (eavesbard-tofu-state), derived
# from CLOUDFLARE_API_TOKEN, as KEY=value lines for $GITHUB_ENV or `source`:
#   AWS_ACCESS_KEY_ID=<the token's ID>
#   AWS_SECRET_ACCESS_KEY=<the SHA-256 of the token>
# This is Cloudflare's rule for using an API token with R2's S3 API
# (https://developers.cloudflare.com/r2/api/tokens/), so the one token serves
# both the cloudflare provider (dns/) and the s3 backend (posthog/, dns/).
set -o errexit -o nounset -o pipefail

: "${CLOUDFLARE_API_TOKEN:?is not set}"
account_id=5154cc96c06ec81c712d8fd51a642c9c # Not secret: it's in R2's endpoint.

# The token's ID, from Cloudflare's verify endpoint: the account one for an
# account-owned token (Manage Account > Account API Tokens), the user one for
# a token made under My Profile.
verify() {
  curl --silent --show-error \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/$1/tokens/verify" |
    jq --raw-output 'select(.success) | .result.id // empty'
}
id=$(verify "accounts/$account_id")
[[ -n $id ]] || id=$(verify user)
if [[ -z $id ]]; then
  echo "$0: Cloudflare didn't accept CLOUDFLARE_API_TOKEN" >&2
  exit 1
fi

echo "AWS_ACCESS_KEY_ID=$id"
echo "AWS_SECRET_ACCESS_KEY=$(printf '%s' "$CLOUDFLARE_API_TOKEN" | sha256sum | cut -d ' ' -f 1)"

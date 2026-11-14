# eavesbard.com's DNS records in Cloudflare, so they're reviewed and changed
# here rather than in Cloudflare's dashboard. CI plans on pull requests and
# applies on pushes to main (.github/workflows/dns.yml).
#
# Credentials come from the environment:
#   CLOUDFLARE_API_TOKEN                       eavesbard's Cloudflare token: DNS Edit on the zone
#                                              and R2 object read and write on the state bucket
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   the state bucket's S3 keys, derived from that token
#                                              by tools/r2-keys.sh
# Locally (on termina, with the keys in KDE Wallet): dns/run.sh plan

terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # The exact version is in versions.tf, at the repository's root.
      version = ">= 5.0"
    }
  }

  # The same R2 bucket as posthog/, under its own key. See posthog/main.tf.
  backend "s3" {
    bucket                      = "eavesbard-tofu-state"
    key                         = "dns/terraform.tfstate"
    region                      = "auto"
    endpoints                   = { s3 = "https://5154cc96c06ec81c712d8fd51a642c9c.eu.r2.cloudflarestorage.com" }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

provider "cloudflare" {}

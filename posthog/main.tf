# PostHog's insights and dashboard for the usage counts (DESIGN.md 7.11), so
# they're reviewed and changed here rather than in PostHog's UI. CI plans on
# pull requests and applies on pushes to main (.github/workflows/posthog.yml).
#
# Credentials come from the environment:
#   POSTHOG_API_KEY                            a personal API key limited to the project
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   the R2 token for the state bucket
# Locally (on termina, with the keys in KDE Wallet): posthog/run.sh plan

terraform {
  required_providers {
    posthog = {
      source  = "PostHog/posthog"
      version = "1.0.24"
    }
  }

  # State in Cloudflare R2, through its S3-compatible API. R2 supports the
  # conditional writes use_lockfile needs; the skip_* settings turn off the
  # AWS-only checks.
  backend "s3" {
    bucket                      = "eavesbard-tofu-state"
    key                         = "posthog/terraform.tfstate"
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

provider "posthog" {
  host       = "https://eu.posthog.com"
  project_id = "306168"
}

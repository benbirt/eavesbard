# The providers' exact versions, for every OpenTofu configuration here
# (posthog/, dns/), which declare at most a floor. rules_tofu reads them with
# the lock beside this file (.terraform.lock.hcl, tf_providers.from_lock in
# MODULE.bazel), and Dependabot updates both. After changing a version by
# hand, rewrite the lock with:
#   bazel run @tf_providers//:pin
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.29.0"
    }
    posthog = {
      source  = "PostHog/posthog"
      version = "1.0.28"
    }
  }
}

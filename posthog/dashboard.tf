# The usage dashboard, from insights.json: each insight's name, description,
# tile and query, written from insights.ts, where they're typed against the
# app's events. Visitors are counted per day only (cookieless), so a week's
# or month's visitors aren't the sum of its days.

locals {
  insights = jsondecode(file("${path.module}/insights.json"))
}

resource "posthog_dashboard" "usage" {
  name        = "Usage"
  description = "How Eavesbard is used. Managed in github.com/benbirt/eavesbard (posthog/): change it there, not here."
}

resource "posthog_insight" "usage" {
  for_each = local.insights

  name          = each.value.name
  description   = each.value.description
  query_json    = jsonencode(each.value.query)
  dashboard_ids = [posthog_dashboard.usage.id]
}

resource "posthog_dashboard_layout" "usage" {
  dashboard_id = posthog_dashboard.usage.id

  # Each tile carries its own position, so the order here (by key) doesn't matter.
  tiles = [for key, insight in local.insights : {
    insight_id       = posthog_insight.usage[key].id
    layouts_json     = jsonencode({ sm = insight.tile })
    show_description = true
  }]
}

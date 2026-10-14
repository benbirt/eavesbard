# The usage dashboard: one insight per query in queries/ (checked against
# PostHog's schema by check-queries.sh), laid out on PostHog's 12-column grid
# at the positions below. Visitors are counted per day only (cookieless), so a
# week's or month's visitors aren't the sum of its days.

locals {
  # key (the query file's name), name and description, and the tile's position (x, y) and size (w, h).
  insights = [
    { key = "visitors", name = "Visitors per day", x = 0, y = 0, w = 6, h = 5,
    description = "Unique visitors each day. Cookieless, so visitors can't be told apart across days: don't add days up." },
    { key = "sessions", name = "Sessions per day", x = 6, y = 0, w = 6, h = 5,
    description = "Sessions begun each day." },
    { key = "funnel", name = "From visit to music", x = 0, y = 5, w = 12, h = 6,
    description = "Of each day's visitors, how many agreed to downloads, began a session and heard a track, within a day." },
    { key = "tracks_by_host", name = "Tracks played, by host", x = 0, y = 11, w = 6, h = 5,
    description = "Tracks asked for each week, by the site they're streamed from: the traffic Eavesbard sends each." },
    { key = "session_minutes", name = "Session length", x = 6, y = 11, w = 3, h = 5,
    description = "Average minutes per session, by week (sessions ended by Stop or by closing the page)." },
    { key = "tracks_per_session", name = "Tracks per session", x = 9, y = 11, w = 3, h = 5,
    description = "Average tracks per session, by week." },
    { key = "automatic", name = "Automatic music", x = 0, y = 16, w = 3, h = 5,
    description = "Sessions with automatic music on (true) or off, last 90 days." },
    { key = "scene_engine", name = "Scene engine", x = 3, y = 16, w = 3, h = 5,
    description = "Sessions by scene engine (local models or Claude), last 90 days." },
    { key = "speech_model", name = "Speech model", x = 6, y = 16, w = 3, h = 5,
    description = "Sessions by speech model (Whisper size, or the browser's own), last 90 days." },
    { key = "ended_by", name = "How sessions end", x = 9, y = 16, w = 3, h = 5,
    description = "Sessions ended by Stop, or by the page closing, last 90 days." },
    { key = "model_downloads", name = "First model downloads", x = 0, y = 21, w = 12, h = 5,
    description = "Models downloaded for the first time in a browser, by model, by week." },
  ]
}

resource "posthog_dashboard" "usage" {
  name        = "Usage"
  description = "How Eavesbard is used. Managed in github.com/benbirt/eavesbard (posthog/): change it there, not here."
}

resource "posthog_insight" "usage" {
  for_each = { for insight in local.insights : insight.key => insight }

  name        = each.value.name
  description = each.value.description
  # Re-encoded, so formatting in the file never shows up as a change.
  query_json    = jsonencode(jsondecode(file("${path.module}/queries/${each.key}.json")))
  dashboard_ids = [posthog_dashboard.usage.id]
}

resource "posthog_dashboard_layout" "usage" {
  dashboard_id = posthog_dashboard.usage.id

  tiles = [for insight in local.insights : {
    insight_id       = posthog_insight.usage[insight.key].id
    layouts_json     = jsonencode({ sm = { x = insight.x, y = insight.y, w = insight.w, h = insight.h } })
    show_description = true
  }]
}

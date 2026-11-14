# eavesbard.app redirects every request, on either name, to the same path on
# eavesbard.com, keeping the query string: a Single Redirect rule, in the
# zone's entry point ruleset for the dynamic redirect phase (Cloudflare names
# entry point rulesets "default").
resource "cloudflare_ruleset" "eavesbard_app_redirect" {
  zone_id = local.zone_ids["eavesbard.app"]
  name    = "default"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [
    {
      ref         = "5aae155703b74c5e90a5c44121b1e5c8"
      description = "redirect to eavesbard.com"
      expression  = "true"
      action      = "redirect"
      enabled     = true
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://eavesbard.com\", http.request.uri.path)"
          }
        }
      }
    },
  ]
}

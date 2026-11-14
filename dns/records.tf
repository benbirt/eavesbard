# Every record in the eavesbard.com zone. A record added in Cloudflare's
# dashboard isn't managed until it's listed here (dns/run.sh records shows
# them all), and a change made there to one listed here is undone by the next
# apply.

locals {
  # Not secret: it's in the zone's dashboard URL. Shown by dns/run.sh records.
  zone_id = "TODO"

  # GitHub Pages serves the site (CI deploys it from main): its four apex
  # addresses, from GitHub's documentation, and www as a CNAME to the user
  # site, which GitHub redirects to the apex. Not proxied, so GitHub can issue
  # the certificate itself.
  github_pages = {
    pages_a_108     = { type = "A", content = "185.199.108.153" }
    pages_a_109     = { type = "A", content = "185.199.109.153" }
    pages_a_110     = { type = "A", content = "185.199.110.153" }
    pages_a_111     = { type = "A", content = "185.199.111.153" }
    pages_aaaa_8000 = { type = "AAAA", content = "2606:50c0:8000::153" }
    pages_aaaa_8001 = { type = "AAAA", content = "2606:50c0:8001::153" }
    pages_aaaa_8002 = { type = "AAAA", content = "2606:50c0:8002::153" }
    pages_aaaa_8003 = { type = "AAAA", content = "2606:50c0:8003::153" }
  }

  records = merge(
    { for key, r in local.github_pages : key => merge(r, { name = "eavesbard.com" }) },
    {
      www = { type = "CNAME", name = "www.eavesbard.com", content = "benbirt.github.io" }

      # Verifies the domain for benbirt's GitHub Pages, so no other account
      # can claim it.
      pages_verification = {
        type    = "TXT"
        name    = "_github-pages-challenge-benbirt.eavesbard.com"
        content = "\"c2fc4185f102bfab09718e271fadd0\""
      }

      # The domain sends no mail.
      spf = { type = "TXT", name = "eavesbard.com", content = "\"v=spf1 -all\"" }
    },
  )

  # The records' Cloudflare IDs, to adopt the existing records into the state
  # on the first apply (the import blocks below) rather than create them
  # again. Shown by dns/run.sh records. Once that apply has run, this and the
  # import blocks can go.
  record_ids = {
    pages_a_108        = "TODO"
    pages_a_109        = "TODO"
    pages_a_110        = "TODO"
    pages_a_111        = "TODO"
    pages_aaaa_8000    = "TODO"
    pages_aaaa_8001    = "TODO"
    pages_aaaa_8002    = "TODO"
    pages_aaaa_8003    = "TODO"
    www                = "TODO"
    pages_verification = "TODO"
    spf                = "TODO"
  }
}

resource "cloudflare_dns_record" "this" {
  for_each = local.records

  zone_id = local.zone_id
  type    = each.value.type
  name    = each.value.name
  content = each.value.content
  ttl     = 1 # automatic
  proxied = false
}

import {
  for_each = local.record_ids
  to       = cloudflare_dns_record.this[each.key]
  id       = "${local.zone_id}/${each.value}"
}

# Every DNS record in Eavesbard's two zones: eavesbard.com, where the site is,
# and eavesbard.app, which only redirects to it (redirect.tf). A record added
# in Cloudflare's dashboard isn't managed until it's listed here (dns/run.sh
# records shows them all), and a change made there to one listed here is
# undone by the next apply.

locals {
  # Not secret: they're in each zone's dashboard URL.
  zone_ids = {
    "eavesbard.com" = "eb781b3fe5a63325aee62bc6a06f9410"
    "eavesbard.app" = "4e873c41c79b8c019459641b39b8c277"
  }

  # GitHub Pages serves the site (CI deploys it from main): its four IPv4 and
  # four IPv6 apex addresses, from GitHub's documentation. Not proxied, so
  # GitHub can issue the certificate itself.
  github_pages_addresses = {
    pages_a_108     = { type = "A", content = "185.199.108.153" }
    pages_a_109     = { type = "A", content = "185.199.109.153" }
    pages_a_110     = { type = "A", content = "185.199.110.153" }
    pages_a_111     = { type = "A", content = "185.199.111.153" }
    pages_aaaa_8000 = { type = "AAAA", content = "2606:50c0:8000::153" }
    pages_aaaa_8001 = { type = "AAAA", content = "2606:50c0:8001::153" }
    pages_aaaa_8002 = { type = "AAAA", content = "2606:50c0:8002::153" }
    pages_aaaa_8003 = { type = "AAAA", content = "2606:50c0:8003::153" }
  }

  # Neither domain sends mail: SPF allows no sender, and DMARC tells
  # receivers to reject anything claiming to be from it. Cloudflare stores
  # TXT contents with their quotes.
  no_mail = merge([
    for zone in keys(local.zone_ids) : {
      "${zone}_spf"   = { zone = zone, type = "TXT", name = zone, content = "\"v=spf1 -all\"", proxied = false }
      "${zone}_dmarc" = { zone = zone, type = "TXT", name = "_dmarc.${zone}", content = "\"v=DMARC1; p=reject;\"", proxied = false }
    }
  ]...)

  records = merge(
    {
      for key, r in local.github_pages_addresses :
      "eavesbard.com_${key}" => merge(r, { zone = "eavesbard.com", name = "eavesbard.com", proxied = false })
    },
    local.no_mail,
    {
      # www goes to the user site, which GitHub redirects to the apex.
      "eavesbard.com_www" = { zone = "eavesbard.com", type = "CNAME", name = "www.eavesbard.com", content = "benbirt.github.io", proxied = false }

      # Verifies the domain for benbirt's GitHub Pages, so no other account
      # can claim it.
      "eavesbard.com_pages_verification" = {
        zone    = "eavesbard.com"
        type    = "TXT"
        name    = "_github-pages-challenge-benbirt.eavesbard.com"
        content = "\"c2fc4185f102bfab09718e271fadd0\""
        proxied = false
      }

      # eavesbard.app has no server: its names point at 192.0.2.1, an address
      # reserved for documentation, and are proxied, so Cloudflare answers
      # every request with the redirect in redirect.tf before it would reach
      # one.
      "eavesbard.app_apex" = { zone = "eavesbard.app", type = "A", name = "eavesbard.app", content = "192.0.2.1", proxied = true }
      "eavesbard.app_www"  = { zone = "eavesbard.app", type = "A", name = "www.eavesbard.app", content = "192.0.2.1", proxied = true }
    },
  )
}

resource "cloudflare_dns_record" "this" {
  for_each = local.records

  zone_id = local.zone_ids[each.value.zone]
  type    = each.value.type
  name    = each.value.name
  content = each.value.content
  ttl     = 1 # automatic
  proxied = each.value.proxied
}

# Adopts the records made in the dashboard before this file, by their
# Cloudflare IDs (dns/run.sh records), rather than creating them again. Once
# an apply has imported them, these do nothing and can go.
locals {
  imported_record_ids = {
    "eavesbard.com_pages_a_108"        = "a165ddf1605e6a9c6867c1cacf609885"
    "eavesbard.com_pages_a_109"        = "a8370b3809f02134350a4321211901c1"
    "eavesbard.com_pages_a_110"        = "923d098a73db3e795e9e5ced271d2c0f"
    "eavesbard.com_pages_a_111"        = "916f25ea623d8ec7153f09a5a437a5b6"
    "eavesbard.com_pages_aaaa_8000"    = "8da9687f1af91e92fed5a57017762761"
    "eavesbard.com_pages_aaaa_8001"    = "37b4d332568fe677b8dba11b381e139e"
    "eavesbard.com_pages_aaaa_8002"    = "ba43b1a2669c6305281267534d3d5ef8"
    "eavesbard.com_pages_aaaa_8003"    = "daef858aa55f430b7d905dd752fd7da6"
    "eavesbard.com_www"                = "0d4a7d897f419f5e9b2bfbc397062692"
    "eavesbard.com_pages_verification" = "d00617eaa17558d27f3923aa4e04fa7a"
    "eavesbard.com_spf"                = "482c8f6f8db5d837246c4f544d26c36b"
    "eavesbard.com_dmarc"              = "bd3d8f93f2feb0eb42bb5f82dd47daac"
    "eavesbard.app_apex"               = "318d13ab7c071de07fff6c6f28e3f3b3"
    "eavesbard.app_www"                = "101d9c3bc6c9d5caa283fbb68cbc16f6"
    "eavesbard.app_spf"                = "7f3302f5ca0349db289a54ae1439d43e"
    "eavesbard.app_dmarc"              = "83fe670124bda13cd6473c5985536b7f"
  }
}

import {
  for_each = local.imported_record_ids
  to       = cloudflare_dns_record.this[each.key]
  id       = "${local.zone_ids[local.records[each.key].zone]}/${each.value}"
}

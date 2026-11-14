# Every DNS record in Eavesbard's two zones: eavesbard.com, where the site is,
# and eavesbard.app, which only redirects to it (redirect.tf). A record added
# in Cloudflare's dashboard isn't managed until it's listed here (dns/run.sh
# records shows them all), and a change made there to one listed here is
# undone by the next apply. To adopt a record made there rather than create
# it again, list it here with an `import` block naming its ID, as #24 did.

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

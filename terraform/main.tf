# One Worker per site, plus the router that owns baskingspot.dev, plus the Zig
# mirror at zig.baskingspot.dev. For each: an empty Worker, a Cloudflare token
# that can deploy only that Worker, and the token written into the deploying
# repo as a secret. The code is deployed by that repo's CI with wrangler.
# Nothing here deploys code.
#
# The router's custom domains live here, not in wrangler.jsonc. An account
# token cannot carry zone permissions, so a deploy could not reconcile them.

locals {
  # Matt's account. This is not meant to be portable.
  account_id = "a8f237c31d50d262fbb39ceba80df1f6"

  router = "baskingspot-dev"
  mirror = "baskingspot-zig-mirror"

  roster = jsondecode(file(var.roster_path)).sites

  # Worker name => the repo that deploys it and the secret its token lands in.
  # A site's Worker is private: only the router reaches it, by service binding.
  # The mirror is public through its own domain, so it gets its own secret.
  workers = merge(
    { (local.router) = { repo = "site", secret = "CLOUDFLARE_API_TOKEN" } },
    { (local.mirror) = { repo = "site", secret = "CLOUDFLARE_API_TOKEN_MIRROR" } },
    {
      for slug, site in local.roster : "${local.router}-${slug}" => {
        repo   = site.repo
        secret = "CLOUDFLARE_API_TOKEN"
      }
    },
  )

  repos = toset([for worker in local.workers : worker.repo])
}

resource "cloudflare_worker" "this" {
  for_each = local.workers

  account_id = local.account_id
  name       = each.key

  # Matches workers_dev and preview_urls in each wrangler config: no public URL.
  subdomain = {
    enabled          = false
    previews_enabled = false
  }
}

data "cloudflare_account_api_token_permission_groups_list" "editor" {
  account_id = local.account_id
  name       = "Individual%20Workers%20Editor"
}

data "cloudflare_account_api_token_permission_groups_list" "metadata_read" {
  account_id = local.account_id
  name       = "Individual%20Workers%20Metadata%20Read-Only"
}

data "cloudflare_account_api_token_permission_groups_list" "content_read" {
  account_id = local.account_id
  name       = "Individual%20Workers%20Content%20Read-Only"
}

resource "cloudflare_account_token" "deploy" {
  for_each = local.workers

  account_id = local.account_id
  name       = "${each.key}-deploy"

  policies = [
    {
      effect = "allow"
      permission_groups = [
        { id = data.cloudflare_account_api_token_permission_groups_list.editor.result[0].id },
        { id = data.cloudflare_account_api_token_permission_groups_list.metadata_read.result[0].id },
        { id = data.cloudflare_account_api_token_permission_groups_list.content_read.result[0].id },
      ]
      # The Worker's id is the script tag this scope wants.
      resources = jsonencode({
        ("com.cloudflare.api.account.${local.account_id}") = {
          ("com.cloudflare.edge.worker.script.${cloudflare_worker.this[each.key].id}") = "*"
        }
      })
    },
  ]
}

resource "github_actions_secret" "token" {
  for_each = local.workers

  repository  = each.value.repo
  secret_name = each.value.secret
  value       = cloudflare_account_token.deploy[each.key].value
}

# One variable per repo, because GitHub has one. Keying by Worker made the
# mirror try to create the variable site already had, which GitHub answers
# with 409. The state moved from Worker keys to repo keys on 2026-11-04.
resource "github_actions_variable" "account_id" {
  for_each = local.repos

  repository    = each.value
  variable_name = "CLOUDFLARE_ACCOUNT_ID"
  value         = local.account_id
}















resource "cloudflare_workers_custom_domain" "router" {
  count = var.attach_domain ? 1 : 0

  account_id = local.account_id
  hostname   = "baskingspot.dev"
  service    = cloudflare_worker.this[local.router].name
  zone_name  = "baskingspot.dev"
}

# The Zig mirror is its own public Worker, kept off baskingspot.dev so a
# download path can never look like a site. Its domain has its own switch: the
# first apply creates an empty Worker, and Cloudflare will not attach a domain
# to one with no deployed version.
resource "cloudflare_workers_custom_domain" "zig" {
  count = var.attach_mirror_domain ? 1 : 0

  account_id = local.account_id
  hostname   = "zig.baskingspot.dev"
  service    = cloudflare_worker.this[local.mirror].name
  zone_name  = "baskingspot.dev"
}

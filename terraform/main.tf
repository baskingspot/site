# One Worker per site, plus the router that owns baskingspot.dev. For each:
# an empty Worker, a Cloudflare token that can deploy only that Worker, and
# the token written into the site's repo as the CLOUDFLARE_API_TOKEN secret.
# The code is deployed by that repo's CI with wrangler. Nothing here deploys code.
#
# The router's custom domain lives here, not in wrangler.jsonc. An account
# token cannot carry zone permissions, so a deploy could not reconcile it.

locals {
  # Matt's account. This is not meant to be portable.
  account_id = "a8f237c31d50d262fbb39ceba80df1f6"

  router = "baskingspot-dev"

  roster = jsondecode(file(var.roster_path)).sites

  # Worker name => the repo that deploys it. A site's Worker is private: only
  # the router reaches it, by service binding.
  workers = merge(
    { (local.router) = { repo = "site" } },
    { for slug, site in local.roster : "${local.router}-${slug}" => { repo = site.repo } },
  )
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
  secret_name = "CLOUDFLARE_API_TOKEN"
  value       = cloudflare_account_token.deploy[each.key].value
}

resource "github_actions_variable" "account_id" {
  for_each = local.workers

  repository    = each.value.repo
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

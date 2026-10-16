mock_provider "cloudflare" {
  mock_data "cloudflare_account_api_token_permission_groups_list" {
    defaults = {
      result = [{ id = "permission-group-id", name = "group", category = "workers", is_selectable = true, scopes = [] }]
    }
  }
}

mock_provider "github" {}

variables {
  roster_path = "tests/roster.json"
}

run "workers_tokens_and_secrets" {
  command = apply

  assert {
    condition     = toset(keys(cloudflare_worker.this)) == toset(["baskingspot-dev", "baskingspot-dev-stdx", "baskingspot-dev-zig-benchmark"])
    error_message = "Expected the router and one Worker per roster entry."
  }

  assert {
    condition     = toset(keys(cloudflare_account_token.deploy)) == toset(keys(cloudflare_worker.this))
    error_message = "Every Worker needs its own token."
  }

  assert {
    condition     = github_actions_secret.token["baskingspot-dev"].repository == "site" && github_actions_secret.token["baskingspot-dev-stdx"].repository == "stdx" && github_actions_secret.token["baskingspot-dev-zig-benchmark"].repository == "benchmark"
    error_message = "Each token must land in the repo that deploys that Worker."
  }

  assert {
    condition     = alltrue([for name, token in cloudflare_account_token.deploy : strcontains(token.policies[0].resources, cloudflare_worker.this[name].id)])
    error_message = "Each token must be scoped to its own Worker's id."
  }

  assert {
    condition     = alltrue([for name, worker in cloudflare_worker.this : worker.subdomain.enabled == false])
    error_message = "A Worker must have no workers.dev URL."
  }

  assert {
    condition     = length(cloudflare_workers_custom_domain.router) == 1 && cloudflare_workers_custom_domain.router[0].service == "baskingspot-dev"
    error_message = "baskingspot.dev must point at the router."
  }
}

run "domain_can_be_held_back" {
  command = apply

  variables {
    attach_domain = false
  }

  assert {
    condition     = length(cloudflare_workers_custom_domain.router) == 0
    error_message = "attach_domain = false must not create the domain."
  }
}

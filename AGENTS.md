# AGENTS.md

Working notes for AI coding agents in baskingspot/site.

## What this is

The router Worker for baskingspot.dev, and the OpenTofu that creates one Worker, one scoped deploy token, and one set of repo secrets per site. The design and its tests are in `~/code/baskingspot/IDEAS.md`, section "docs site design, parent router plus private child Workers".

## Environment

The flake is the tool contract, from `baskingspot/nix`. `nix develop` provides OpenTofu, tflint, wrangler, oxfmt, oxlint, and Node. The justfile is the command interface: `just test`, `just lint`, `just ci`.

## Rules

- Never run `just apply` or `tofu apply`, and never deploy, unless Matt asked for that exact action. Apply mints real tokens and writes secrets into other repos.
- Never commit state. It holds every minted token. `.gitignore` covers it.
- The Cloudflare account ID is hardcoded in `terraform/main.tf` on purpose. This repo is not portable. Don't turn it into a variable.
- The router doesn't strip the path prefix. Each site builds into `<slug>/`. If the router stripped it, a site's own redirects would send the browser out of the prefix.
- A site's Worker is named `baskingspot-dev-<slug>` and its binding is `SITE_<SLUG>`. Change one only with the other.
- The router's custom domain is in Terraform, not in `wrangler.jsonc`. An account token can't carry zone permissions, so a wrangler deploy can't reconcile a domain.
- `router/public/` is generated and ignored. Edit `router/index.html` and `router/static/`. `just build` writes it, and `just deploy` and `just dev` run it first.
- Every `sites.json` entry has a `kind`, `library` or `tool`. The landing page shows a column for each kind that has sites, and `renderSites` throws on any other value. Add a kind in `COLUMNS` in `router/build.mjs` and test it.
- Add a site's binding to `router/wrangler.jsonc` only after its repo has deployed its Worker once. Binding a Worker with no deployed version fails.
- Don't hand-copy a Worker's script tag. A token's scope takes `cloudflare_worker.this[...].id`.
- Format OpenTofu with `tofu fmt`. Recipes carry `[doc]` and `[group]`. Commit messages are one line, `area: summary`, and every commit is signed.

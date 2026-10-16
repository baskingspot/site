<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/static/logo-dark.svg">
    <img src="docs/static/logo.svg" alt="site" height="48">
  </picture>
</h1>

The router for baskingspot.dev, and the Terraform that gives each library its own Worker.

`baskingspot.dev/stdx/` is stdx's docs. Each library repo builds its docs into a folder named for its slug and deploys them to a private Cloudflare Worker, `baskingspot-dev-stdx`. That Worker has no public URL. The router in this repo is the only public Worker. It sends `/stdx/...` to the stdx Worker through a service binding and serves the landing page itself. It doesn't strip the prefix, so a library's own redirects, like `/stdx/api` to `/stdx/api/`, stay inside it.

## Layout

| Path               | Content                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `sites.json`       | The roster: each slug and the repo that deploys it                                                                 |
| `router/`          | The router Worker, its `wrangler.jsonc`, and the landing page in `public/`                                         |
| `terraform/`       | For each site and the router: an empty Worker, a token scoped to it, and the token written into the repo's secrets |
| `terraform/tests/` | Tests with mocked providers. They check the wiring: one token per Worker, scoped to its id                         |

The router's `wrangler.jsonc` lists one service binding per site it serves, named `SITE_<SLUG>`.

## Add a site

1. Add the slug and its repo to `sites.json`: `"stdx": { "repo": "stdx" }`.
2. Run `just plan`, read it, and run `just apply`. It creates the Worker `baskingspot-dev-<slug>`, a token that can deploy only that Worker, and sets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the repo.
3. In the library repo, deploy the Worker with `wrangler deploy`, using the secret from step 2.
4. In this repo, add the matching binding to `router/wrangler.jsonc` and push. CI deploys the router.

The router can't bind a Worker that has no deployed version, which is why step 4 comes after step 3.

## Work on it

`nix develop` provides OpenTofu, wrangler, and the linters, and `direnv allow` loads them. Copy `.envrc.local.example` to `.envrc.local` and set the two tokens. `just` lists the recipes, and `just ci` runs the tests and the lint.

Only a person runs `just apply`, with a Cloudflare token that can create account tokens. The state file holds every minted token, so it stays on that person's machine and is gitignored. If the state is lost, `just apply` mints new tokens and overwrites the secrets in each repo.

## License

MIT. See `LICENSE`.

The logo files in `docs/static/` are baskingspot marks and are not covered by the MIT license. See `docs/static/LICENSE`.

## How it's made

Built with LLM assistance. [How, in detail](https://github.com/baskingspot/.github/blob/main/docs/AI.md).

<a href="https://github.com/baskingspot"><img src="https://raw.githubusercontent.com/baskingspot/.github/main/brand/assets/badge.svg" alt="baskingspot" height="24"></a>

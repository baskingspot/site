<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/static/logo-dark.svg">
    <img src="docs/static/logo.svg" alt="site" height="48">
  </picture>
</h1>

The router for baskingspot.dev, and the Terraform that gives each library its own Worker.

`baskingspot.dev/stdx/` is stdx's docs. Each library repo builds its docs into a folder named for its slug and deploys them to a private Cloudflare Worker, `baskingspot-dev-stdx`. That Worker has no public URL. The router in this repo is the only public Worker. It sends `/stdx/...` to the stdx Worker through a service binding and serves the landing page itself. It doesn't strip the prefix, so a library's own redirects, like `/stdx/api` to `/stdx/api/`, stay inside it.

## Layout

| Path               | Content                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sites.json`       | The roster: each slug, the repo that deploys it, and a one-sentence description for the landing page                                                 |
| `router/`          | The router Worker and its `wrangler.jsonc`. `index.html` and `static/` are the landing page. `build.mjs` writes `public/` from them and `sites.json` |
| `terraform/`       | For each site and the router: an empty Worker, a token scoped to it, and the token written into the repo's secrets                                   |
| `terraform/tests/` | Tests with mocked providers. They check the wiring: one token per Worker, scoped to its id                                                           |

The router's `wrangler.jsonc` lists one service binding per site it serves, named `SITE_<SLUG>`.

The router also adds security headers to every site's responses, and replaces any 404 with the branded page. The front page gets its headers from `router/static/_headers`. `just build` writes `sitemap.xml` from the roster and `security.txt`, whose `Expires` is a year past the build. The zone's own settings (HTTPS only, HSTS, TLS 1.2, mail records) are Terraform in `~/code/cloudflare`, not here.

## Markdown for agents

Every page has a markdown copy at the same path, with `index.md` in place of the
trailing slash. `/stdx/` is `/stdx/index.md`. A library's docs build writes the
copy from the markdown the site is generated from, so it is the source, not a
conversion of the HTML.

The router does three things with that:

- A request with `Accept: text/markdown` gets the copy, sent as
  `text/markdown`. When the copy is missing, the router serves the HTML page
  instead of a 404.
- Every response advertises the copy with
  `Link: </stdx/index.md>; rel="alternate"; type="text/markdown"`, and the
  index at `/llms.txt` with `rel="describedby"`. It also sets
  `Vary: Accept`, so a cache keeps the two apart, and marks the markdown
  `noindex` so it does not compete with the page.
- The front page is an asset, and assets answer before the Worker runs.
  `run_worker_first` in `wrangler.jsonc` names `/`, so the front page
  negotiates too.

`just build` writes `/llms.txt` from `sites.json` in the llmstxt.org v2 format,
and the front page's own copy at `/index.md`.

## Add a site

1. Add the slug, its repo, its `kind`, and a one-sentence description to `sites.json`: `"stdx": { "repo": "stdx", "kind": "library", "description": "..." }`. `kind` is `library` or `tool`, and picks the landing page column. The description is the entry on the page, and an unknown `kind` fails the build.
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

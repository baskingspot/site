# baskingspot/site: the router for baskingspot.dev and the Terraform behind it.
# README.md says what lives here. AGENTS.md holds the working conventions.

[private]
default:
    @just --list

[doc("Run the router tests (the roster must match the router's service bindings), the Terraform tests with mocked providers, and `tofu validate`")]
[group("test")]
test:
    node --test "router/test/*.test.mjs"
    tofu -chdir=terraform init -backend=false -input=false > /dev/null
    tofu -chdir=terraform validate
    tofu -chdir=terraform test

[doc("Check OpenTofu (tofu fmt, tflint), the router (oxlint, oxfmt), Nix, Markdown and JSON, the workflows, and this justfile")]
[group("lint")]
lint:
    tofu fmt -check -recursive terraform
    tflint --chdir terraform
    oxlint router
    oxfmt --check README.md AGENTS.md docs router sites.json router/skills.json .github
    nix fmt -- --ci
    actionlint
    zizmor .
    just --fmt --check

[doc("Format everything lint checks")]
[group("lint")]
fmt:
    tofu fmt -recursive terraform
    oxfmt README.md AGENTS.md docs router sites.json router/skills.json .github
    nix fmt
    just --fmt

[doc("Everything CI runs")]
[group("ci")]
ci: test lint build

[doc("Build router/public: the static files, and the landing page with one entry per site in sites.json")]
[group("deploy")]
build:
    node router/build.mjs

[doc("Show what applying the Terraform would change. Needs CLOUDFLARE_API_TOKEN and GITHUB_TOKEN, see .envrc.local.example")]
[group("terraform")]
plan:
    tofu -chdir=terraform init -input=false
    tofu -chdir=terraform plan

[doc("Apply the Terraform: create the Workers, the tokens, and the secrets in each repo. Only a person runs this")]
[group("terraform")]
apply:
    tofu -chdir=terraform init -input=false
    tofu -chdir=terraform apply

[doc("Deploy the router. CI runs this on main with the token Terraform minted. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID")]
[group("deploy")]
deploy: build
    wrangler deploy --config router/wrangler.jsonc

[doc("Run the router and the landing page locally on port 8787")]
[group("deploy")]
dev: build
    wrangler dev --config router/wrangler.jsonc

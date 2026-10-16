terraform {
  required_version = ">= 1.13.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }
}

# Auth comes from CLOUDFLARE_API_TOKEN and GITHUB_TOKEN in the environment.
provider "cloudflare" {}

provider "github" {
  owner = "baskingspot"
}

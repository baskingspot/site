variable "roster_path" {
  type        = string
  default     = "../sites.json"
  description = "The roster of sites, relative to this directory. The tests point it at a fixture."
}

variable "attach_domain" {
  type        = bool
  default     = true
  description = "Attach baskingspot.dev to the router. If the first apply fails because the router has no deployed version, apply with false, deploy the router, then apply again with true."
}

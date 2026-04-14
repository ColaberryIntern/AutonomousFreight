# Autonomous Freight — Terraform root module (skeleton, NOT APPLIED in Sprint 0).
#
# Per the approved plan, Sprint 0 is local-only; this file exists so:
#   1. `terraform fmt -check` and `terraform validate` run in CI from day one,
#   2. Sprint 13 (Kubernetes migration) inherits a wired directory instead of starting empty.
#
# DO NOT add provider credentials here. All secrets flow via workspace-level vars
# set outside the repo.

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Placeholder — real provider block wired in Sprint 13.
variable "environment" {
  description = "Deployment environment (development | staging | production)."
  type        = string
  default     = "development"
}

variable "aws_region" {
  description = "Target AWS region. Not used until Sprint 13."
  type        = string
  default     = "us-east-1"
}

output "placeholder" {
  description = "Sprint 0 skeleton marker. Replaced with real outputs in Sprint 13."
  value       = "autonomous-freight-${var.environment}"
}

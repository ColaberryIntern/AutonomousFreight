# Sprint 15 — Multi-region DR Terraform skeleton (NOT APPLIED).
# Real provisioning is part of the Sprint 13 deferred apply approval.

variable "dr_secondary_region" {
  description = "Warm-standby AWS region. Unused until apply."
  type        = string
  default     = "us-west-2"
}

variable "dr_replica_lag_target_seconds" {
  description = "Target replication lag (RPO budget). 900s = 15 min."
  type        = number
  default     = 900
}

output "dr_placeholder" {
  description = "Sprint 15 DR skeleton marker."
  value = "autonomous-freight-${var.environment}-dr-secondary-${var.dr_secondary_region}-rpo${var.dr_replica_lag_target_seconds}s"
}

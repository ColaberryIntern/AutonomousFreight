# Sprint 11 — Postgres primary + read-replica Terraform skeleton (NOT applied).
# Wired up in Sprint 13 with K8s migration. Multi-AZ replica + multi-region replica
# extended in Sprint 15 DR drill.

variable "postgres_engine_version" {
  description = "Postgres engine version. Unused until Sprint 13."
  type        = string
  default     = "16.3"
}

variable "postgres_replica_count" {
  description = "Number of read replicas to provision. Unused until Sprint 13."
  type        = number
  default     = 1
}

output "postgres_placeholder" {
  description = "Sprint 11 skeleton marker for Postgres primary + replicas."
  value       = "autonomous-freight-${var.environment}-postgres-${var.postgres_replica_count}r"
}

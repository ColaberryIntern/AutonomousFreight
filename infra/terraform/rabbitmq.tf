# Autonomous Freight — RabbitMQ skeleton (Sprint 4, NOT APPLIED).
#
# Real provisioning lands in Sprint 13 when services split into distinct pods
# and need a shared broker. For Sprint 4 this file exists so:
#   1. `terraform validate` sees the intended topology early,
#   2. Sprint 13 does not start from zero.
#
# Swap to Amazon MQ or AWS SQS as appropriate before applying.

variable "rabbitmq_instance_class" {
  description = "Amazon MQ broker instance class. Unused until Sprint 13."
  type        = string
  default     = "mq.t3.micro"
}

variable "rabbitmq_engine_version" {
  description = "RabbitMQ engine version. Unused until Sprint 13."
  type        = string
  default     = "3.13.2"
}

output "rabbitmq_placeholder" {
  description = "Sprint 4 skeleton marker for the event bus. Replaced in Sprint 13."
  value       = "autonomous-freight-${var.environment}-rabbitmq"
}

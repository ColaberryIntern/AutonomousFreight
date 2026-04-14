# Sprint 13 — EKS cluster + node group skeleton (NOT APPLIED).
# Crosses CLAUDE.md production-environment governance boundary; runtime apply
# is the next session's explicit approval gate.

variable "eks_cluster_name" {
  description = "EKS cluster name. Unused until apply is explicitly approved."
  type        = string
  default     = "autonomous-freight"
}

variable "eks_node_instance_type" {
  description = "EKS node instance type. Unused until apply."
  type        = string
  default     = "t3.medium"
}

variable "eks_node_min_size" {
  description = "Minimum nodes."
  type        = number
  default     = 2
}

variable "eks_node_max_size" {
  description = "Maximum nodes."
  type        = number
  default     = 6
}

output "eks_placeholder" {
  description = "Sprint 13 EKS skeleton marker."
  value       = "${var.eks_cluster_name}-${var.environment}-eks-${var.eks_node_instance_type}"
}

# infra/terraform

Skeleton Terraform configuration. **No `terraform apply` runs in Sprint 0.**

CI runs only:
- `terraform fmt -check`
- `terraform init -backend=false`
- `terraform validate`

Real provider wiring, state backend, and resources land in Sprint 13 (Kubernetes migration).

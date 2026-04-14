# Directive 130 — Kubernetes Deployment & Blue-Green Pipeline

**Status:** active (skeleton — not yet applied)
**Owner:** Platform / Infra
**Sprint:** 13
**Last Updated:** 2026-04-15

---

## Goal

Author the manifests and pipeline that will deploy the gateway and worker pods to a managed Kubernetes cluster (EKS) using a blue-green strategy. **No real cluster is provisioned in this sprint** — the work is pure skeleton so the next session can focus on the apply itself, separately approved.

## Outputs

- `infra/k8s/` directory with:
  - `namespace.yaml`
  - `gateway-deployment.yaml`, `gateway-service.yaml` (ClusterIP)
  - `worker-deployment.yaml`
  - `migration-job.yaml` (runs `npm run migrate` on deploy)
  - `network-policy.yaml` (default-deny, explicit allows)
  - `ingress.yaml` (terminates TLS at the ingress, /metrics blocked at the ingress)
- `infra/k8s/blue-green/` with two `Service` objects (`gateway-blue`, `gateway-green`) and a switch script.
- `.github/workflows/cd.yml` — disabled by default, switches the active color after smoke tests pass.
- `infra/terraform/eks.tf` — cluster + node group skeleton (NOT applied).

## Edge Cases

1. Migration job fails → deployment rollout halted; alert fires; previous color stays active.
2. Smoke tests fail on staging color → CD pipeline aborts before switching the LB.
3. Network policy denies legitimate traffic → documented troubleshooting steps in `infra/k8s/README.md`.

## Safety Constraints

- `/metrics` MUST NOT be reachable from outside the cluster network in production — enforced at ingress.
- Pods run as non-root with read-only root filesystem.
- Image references pinned by sha256 digest, never `:latest`.

## Governance — ESCALATION FILED

Provisioning a real EKS cluster + ingress controller + ACM cert is a CLAUDE.md production-environment change requiring approval. `tmp/escalation.json` written this sprint; runtime apply is the **next session's** explicit approval gate.

## Verification

- Manual: `kubectl apply --dry-run=client -f infra/k8s/` shows no schema errors.
- Manual: `terraform -chdir=infra/terraform validate` passes.
- No automated tests in this sprint (manifests are declarative; CI validates schema).

## Change Log

- 2026-04-15 — Skeleton authored in Sprint 13. NOT applied.

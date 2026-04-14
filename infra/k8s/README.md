# infra/k8s — Sprint 13 skeleton

**Status:** SKELETON. Not applied to any cluster.

## What's here

- `namespace.yaml` — namespace boundary.
- `gateway-deployment.yaml` + `gateway-service.yaml` — gateway pods + ClusterIP.
- `migration-job.yaml` — one-shot DB migration runner.
- `network-policy.yaml` — default-deny + nginx-ingress allow.
- `ingress.yaml` — TLS termination + `/metrics` blocked at the edge.
- `blue-green/` — placeholder for the active-color switch script.

## Why no apply

Provisioning real EKS + ingress + ACM cert + secrets is a production-environment governance boundary per CLAUDE.md. An escalation entry was filed in this sprint's autonomy log; the runtime apply is the next session's explicit approval gate.

## Local validation

```bash
kubectl apply --dry-run=client -f infra/k8s/
```

(no cluster needed — `--dry-run=client` validates schemas only).

## Image policy

All image refs MUST be pinned by `sha256` digest before the first apply. Skeleton uses placeholder digests of all zeros.

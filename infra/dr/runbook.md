# DR Runbook — Single-Region Outage

## NFR target

- **RTO** (Recovery Time Objective): ≤ 1 hour from detection.
- **RPO** (Recovery Point Objective): ≤ 15 minutes data loss.

## Preconditions

- A snapshot ≤ 15 minutes old exists in the warm-standby region's S3 bucket.
- Warm-standby EKS cluster is reachable.
- DNS provider supports record updates within 60 seconds (Route 53 with TTL ≤ 60s).

## Steps

1. **Detect & declare** — on-call confirms primary region is unrecoverable.
2. **Promote replica** — promote the secondary-region Postgres replica to primary.
3. **Deploy gateway** — `kubectl apply -f infra/k8s/` against the standby cluster.
4. **Run migrations** — Job `db-migrate` (idempotent).
5. **Update DNS** — point `api.autonomous-freight.example` at the standby ingress IP.
6. **Smoke test** — `npm run test:e2e` against the new endpoint.
7. **Announce** — status page update + customer comms.

## Rollback

If smoke tests fail after restore: revert DNS, demote secondary-region Postgres, escalate to engineering lead.

## Approval

**Real cross-region failover requires explicit owner approval** (CLAUDE.md production-environment boundary). The local drill at `infra/dr/drill.sh` is safe to run without approval.

# Directive 150 — Multi-Region Disaster Recovery

**Status:** active (drill harness + runbook only — no real cross-region infra)
**Owner:** Platform / Infra
**Sprint:** 15
**Last Updated:** 2026-04-15

---

## Goal

Validate that a single-region outage can be survived inside the NFR commitments: **RTO ≤ 1 hour, RPO ≤ 15 minutes**. Sprint 15 ships the drill harness (a script + checklist) and the Terraform topology skeleton for a warm-standby region. Real provisioning is part of the Sprint 13 deferred apply.

## Outputs

- `infra/dr/runbook.md` — the human procedure (preconditions, steps, rollback, verification).
- `infra/dr/drill.sh` — local simulation: stops the primary docker-compose Postgres, restores from a `pg_dump` snapshot, restarts, replays the smoke-test suite, prints elapsed time.
- `infra/terraform/dr.tf` — secondary-region provider alias + replica skeleton (NOT applied).
- DR drill metric: `dr_drill_seconds` (manual entry until Sprint 17 captures it from the script).

## Edge Cases

1. Snapshot older than 15 minutes → drill aborts (RPO violation).
2. Smoke test fails after restore → drill marked failed; runbook lists rollback to last-known-good.
3. drill.sh run on a system without docker → exits 1 with clear message.

## Safety Constraints

- drill.sh MUST refuse to run if `NODE_ENV=production`.
- Runbook explicitly warns that real failover requires owner approval (production-environment governance boundary).

## Verification

- Local: `bash infra/dr/drill.sh` produces a passing summary on a healthy local stack.

## Change Log

- 2026-04-15 — Created in Sprint 15.

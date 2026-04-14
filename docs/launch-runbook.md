# Launch Runbook

## Pre-launch (T-7 days)

- [ ] All sprint autonomy log entries reviewed; open escalations resolved (Sprints 13, 18).
- [ ] EKS cluster + ACM cert + secrets provisioned and gated by the human-approved apply.
- [ ] Stripe live keys + price ids + webhook secret installed via secrets manager.
- [ ] DNS prepared with TTL ≤ 60s.
- [ ] DR drill (`infra/dr/drill.sh`) passes locally; runbook reviewed.
- [ ] OWASP ZAP baseline shows zero high-severity findings.
- [ ] UAT matrix shows ≥ 90% green for the 3 pilot brokers.
- [ ] Status page configured.

## Cutover (T-0)

1. Deploy `gateway-blue` to production at zero traffic.
2. Run `Job/db-migrate`. Verify exit 0.
3. Smoke test against `gateway-blue` directly via cluster IP.
4. Switch ingress to `gateway-blue` (was `gateway-green` if a prior deploy existed).
5. Watch Grafana for 10 minutes — error rate, p95 latency.
6. Send launch announcement.

## Rollback

- Switch ingress back to the previous color.
- If DB migration is the issue: restore from snapshot per `infra/dr/runbook.md`.

## Post-launch (T+24h)

- [ ] Daily report (`npm run daily-report`) shows expected metrics.
- [ ] Pilot broker comms — collect first-day impressions.
- [ ] File any new escalations.

## Open governance items

- **Sprint 13 EKS apply** — see `tmp/escalation.json`.
- **Sprint 18 Stripe activation** — keys + price ids must be provisioned before billing routes go live.

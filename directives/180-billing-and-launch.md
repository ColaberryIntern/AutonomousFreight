# Directive 180 — Stripe Billing + Launch

**Status:** active (driver pattern + launch runbook; live keys deferred)
**Owner:** Backend / Billing + Platform
**Sprint:** 18
**Last Updated:** 2026-04-15

---

## Goal

Two things land:

1. **Subscription billing** via Stripe with a pluggable `BillingDriver` (`StripeBillingDriver` for prod, `StubBillingDriver` for tests). v1 supports the three pricing tiers from the build guide (Basic $49, Pro $99, Enterprise $199). No live Stripe keys are configured — provisioning the Stripe account + webhook signing secret is a paid-external-service governance boundary; escalation filed.
2. **Launch runbook** (`docs/launch-runbook.md`) — the go/no-go checklist and post-launch comms.

## Outputs

- `services/billing/` package with:
  - `domain/plans.ts` (BASIC / PRO / ENTERPRISE constants).
  - `drivers/billingDriver.ts` interface.
  - `drivers/stripeBillingDriver.ts` (real Stripe SDK wrapper; throws on missing key).
  - `drivers/stubBillingDriver.ts` (in-memory subscription tracker for tests).
- `docs/launch-runbook.md` — checklist + rollback plan.
- Stripe webhook endpoint stubbed at `/api/v1/billing/webhook` (signature verified; no real handler in v1).

## Edge Cases

1. Live Stripe key missing → `StripeBillingDriver` constructor throws → service refuses to start (fail-fast).
2. Webhook signature invalid → `400`.
3. Tier downgrade → schedule effective at end of current period.
4. Canceled subscription with outstanding usage → grace period until end of period; no immediate cutoff.

## Safety Constraints

- NEVER log Stripe API keys, customer card data, or webhook secrets.
- Webhook handler verifies signature before parsing body.
- Live keys MUST be set via secrets manager only — never committed.

## Governance — ESCALATION FILED

A Stripe production account, live keys, and webhook secret are paid-external-service introductions per CLAUDE.md. `tmp/escalation.json` updated this sprint with the Stripe ask alongside the unresolved Sprint-13 EKS ask. Code is shipped; activation is the explicit owner decision.

## Verification

- Unit: stub driver tracks subscriptions; plan constants; webhook signature verifier rejects bad payloads.
- Manual: launch runbook reviewed end-to-end before activation.

## Change Log

- 2026-04-15 — Created in Sprint 18.

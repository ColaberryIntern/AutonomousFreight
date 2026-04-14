# Directive 041 — Notification Service

**Status:** active
**Owner:** Backend / Notifications
**Sprint:** 4
**Last Updated:** 2026-04-14

---

## Goal

Convert domain events into outbound notifications (v1: email only) honoring user preferences. Ship a pluggable driver model so swapping SendGrid / SES / SMTP is configuration, not code.

## Inputs

- Domain events from the bus (Sprint 4 scope: `user.registered`).
- `notification_preferences` row per user (auto-created on first registration with `email_enabled = TRUE`, `in_app_enabled = TRUE`).

## Outputs

- On `user.registered`: if `email_enabled` is true, send welcome email via the configured `EmailDriver`.
- Email subject + body rendered from a named template (`user_registered.welcome`).
- On driver failure: log error with event's `traceId`; do NOT throw back to the bus.

## Drivers

| Driver               | When             | Transport                                        |
| -------------------- | ---------------- | ------------------------------------------------ |
| `CaptureEmailDriver` | tests            | stores sent emails in memory for assertions      |
| `SmtpEmailDriver`    | local dev + prod | nodemailer → MailHog (local) or real SMTP (prod) |

Selection is by env: `EMAIL_DRIVER=smtp \| capture` (default `capture` in tests, `smtp` elsewhere).

## Edge Cases

1. Preferences row missing → treat as defaults (all channels enabled) and create-on-read.
2. `email_enabled = false` → no email sent; log a debug line.
3. SMTP connect failure → log error; emit metric `notifications_failed_total` (Sprint 4 metric is stub; full metrics Sprint 14).
4. Email address invalid at SMTP level → treated as driver failure (same as 3).
5. Duplicate `user.registered` events for same userId → current impl sends twice (idempotency is Sprint 13 concern).

## Safety Constraints

- NEVER include passwords, bearer tokens, or other credentials in email bodies.
- NEVER reveal internal IDs that a user would not recognize (keep template variables minimal).
- Template rendering is pure string interpolation — no HTML execution, no user-controlled template source.
- The SMTP password (if any) is sourced only from `SMTP_PASSWORD` env, never logged.

## Verification Expectations

- Unit tests: template rendering, handler logic with mock driver + mock repo.
- Integration: register via gateway → capture driver holds exactly one email with expected subject.
- Manual (local): `docker compose up mailhog`, register a user, open http://localhost:8025 to see the message.

## Dependencies

- Directive 040 — event bus.
- Directive 010 — user registration publishes the event.
- `nodemailer` for SMTP driver.

## Change Log

- 2026-04-14 — Created in Sprint 4.

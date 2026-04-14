# Directive 060 — MFA, Session Revocation, Audit Log

**Status:** active
**Owner:** Backend / User Service + Platform
**Sprint:** 6
**Last Updated:** 2026-04-14

---

## Goal

Three security-posture upgrades:

1. **TOTP MFA** for any user that has it enabled.
2. **Session revocation** so a logout / role change invalidates outstanding access tokens.
3. **Immutable audit log** of every state-changing action (registration, login, role change, MFA enable, carrier select).

## Outputs

- `POST /auth/mfa/enroll` returns a TOTP secret + otpauth URI; user scans into Authenticator.
- `POST /auth/mfa/verify` confirms a 6-digit code and flips `mfa_enabled = true`.
- Login flow: when MFA is enabled, server returns `200 { mfaRequired: true, mfaChallengeId }` first; client posts `POST /auth/mfa/login` with code → token.
- `POST /auth/logout` revokes the current bearer token (adds `jti` to revoked set).
- `audit_log` table — append-only, every row has `actor_user_id`, `action`, `target`, `metadata` (JSONB), `occurred_at`. `UPDATE` and `DELETE` are denied at the policy layer (Sprint 14 hardens with row-level security).

## Edge Cases

1. MFA enroll called twice → second call rotates the secret, invalidates the first.
2. Verify with wrong code → `401`; do not flip flag; rate-limit applies (gateway).
3. Login for MFA-enabled user without the second step → `200 mfaRequired: true`, no token.
4. Revoked token presented → `401` (auth middleware checks revocation set).
5. SMS path (per build guide §security) deferred — TOTP only in v1.

## Safety Constraints

- TOTP secrets stored encrypted at rest (AES-256-GCM with key from `MFA_KEK` env). Never logged.
- Audit-log writes MUST NOT block the request path on failure — write best-effort, log on error.
- Revocation set is in-memory + Postgres-backed; survives restart via DB.

## Verification

- Unit: TOTP enroll/verify, encryption helpers, revocation-set behavior, audit-log emitter.
- Integration: full MFA flow + revoked-token rejection + audit row appears.

## Change Log

- 2026-04-14 — Created in Sprint 6.

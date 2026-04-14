# Directive 010 — User Registration & Authentication

**Status:** active
**Owner:** Backend / User Service
**Sprint:** 1
**Last Updated:** 2026-04-13

---

## Goal

Provide deterministic, secure user registration and password-based authentication for the Autonomous Freight platform. Users receive a signed JWT on successful login; all stored passwords are bcrypt-hashed; all inputs are validated at the boundary.

## Inputs

- `POST /auth/register` body — `{ email: string, password: string, role?: Role }` (content-type: application/json).
- `POST /auth/login` body — `{ email: string, password: string }`.
- Environment: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL` (default `15m`).

## Outputs

- `201 Created` on registration with body `{ userId: string, email: string, roles: Role[] }`.
- `200 OK` on login with body `{ accessToken: string, tokenType: "Bearer", expiresIn: number }`.
- Persisted row in `users` (email unique, `password_hash`, `created_at`, `updated_at`).
- Persisted row in `user_roles` joining user → default role `broker` (or the requested role, if whitelisted).

## Edge Cases

Each case MUST have a corresponding test.

1. Email malformed (`not-an-email`) → `400 Bad Request`, no DB write.
2. Password fails policy (min 12 chars, ≥1 letter, ≥1 digit) → `400`, no DB write.
3. Email already registered → `409 Conflict`, no DB write.
4. Role not in whitelist (`admin`, `broker`, `carrier`, `auditor`) → `400`.
5. Login with wrong password → `401 Unauthorized` with generic message (no user-enumeration signal).
6. Login for non-existent user → `401` with same generic message + same latency profile.
7. JWT issuance failure (missing secret) → `500`, error logged, no token leaked.
8. Simultaneous duplicate registrations (race) → unique constraint handles; second request gets `409`.

## Safety Constraints

- NEVER store or log plaintext passwords.
- NEVER return stack traces or raw DB errors to clients.
- NEVER emit bearer tokens into logs.
- Password hash cost factor ≥ 12 (bcrypt).
- Constant-time password compare (bcrypt.compare is constant-time by design).
- Rate limiting belongs in API Gateway (Sprint 2); until then, document the gap in Safety Notes.

## Verification Expectations

- Unit tests: `tests/unit/user/password.test.ts`, `tests/unit/user/jwt.test.ts`, `tests/unit/user/validation.test.ts`.
- Integration tests: `tests/integration/user/register.test.ts`, `tests/integration/user/login.test.ts`.
- E2E coverage: deferred to Sprint 5.
- Manual: `curl POST /auth/register` → `curl POST /auth/login` → token returned.

## Dependencies

- Postgres 16 (docker-compose in Sprint 0).
- `bcryptjs` (pure JS, no native build needed).
- `jsonwebtoken`.
- `zod` for input validation.

## Safety Notes (Known Gaps)

- No rate limiting yet (Sprint 2 — API Gateway).
- No email verification yet (deferred to Sprint 5 hardening).
- No MFA yet (Sprint 6).

## Change Log

- 2026-04-13 — Created in Sprint 1.

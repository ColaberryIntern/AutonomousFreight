# Directive 011 — Role-Based Access Control (RBAC)

**Status:** active
**Owner:** Backend / User Service
**Sprint:** 1
**Last Updated:** 2026-04-13

---

## Goal

Enforce deterministic, coarse-grained role authorization at the HTTP boundary so that every protected route explicitly declares the roles allowed to access it.

## Inputs

- JWT bearer token in `Authorization: Bearer <token>` header.
- Route declaration listing permitted roles (e.g., `requireRole('admin', 'auditor')`).
- Current state of the `user_roles` table at token-issue time (roles are embedded in the JWT `roles` claim).

## Outputs

- `req.user = { userId, email, roles }` populated on authenticated requests.
- `401 Unauthorized` when the token is missing, malformed, expired, or its signature fails.
- `403 Forbidden` when the authenticated user lacks any of the required roles.
- Structured log entry (Sprint 2 gateway will emit it; Sprint 1 uses `console.warn`).

## Roles

Whitelist (v1): `admin`, `broker`, `carrier`, `auditor`. Adding or renaming a role is a **governance boundary** per CLAUDE.md — requires escalation.

## Edge Cases

1. No `Authorization` header → `401`.
2. `Authorization` header not starting with `Bearer ` → `401`.
3. Token valid but expired → `401`.
4. Token signature invalid → `401` (do NOT reveal "signature mismatch" to client).
5. Token valid, user has no overlapping role with requirement → `403`.
6. Token valid, user has at least one required role → `next()` called, `req.user` populated.
7. Route declared with empty required-roles list → treated as "any authenticated user OK".
8. Clock skew ±60s tolerated (JWT verify `clockTolerance: 60`).

## Safety Constraints

- NEVER trust `req.user` from the client; always derive from verified JWT.
- NEVER include role-elevation endpoints in Sprint 1 scope (admin role assignment is an internal DB operation until Sprint 7).
- NEVER cache the token-to-user mapping across processes without invalidation (out of scope for Sprint 1; revisited in Sprint 6 with session revocation).

## Verification Expectations

- Unit tests: `tests/unit/user/rbac.test.ts` covering cases 1–8.
- Integration tests: `tests/integration/user/protectedRoute.test.ts`.
- Manual: call protected route without token (401) → with wrong role (403) → with correct role (200).

## Dependencies

- Directive 010 (registration/login issues the JWT this middleware verifies).

## Change Log

- 2026-04-13 — Created in Sprint 1.

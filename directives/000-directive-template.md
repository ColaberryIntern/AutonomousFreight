# Directive NNN — {Title}

**Status:** draft | active | deprecated
**Owner:** {role}
**Sprint:** {sprint number}
**Last Updated:** YYYY-MM-DD

---

## Goal

One or two sentences describing the business/system outcome this directive governs.

## Inputs

- Named input 1 — type, source, constraints.
- Named input 2 — …

## Outputs

- Named output 1 — type, sink, guarantees (e.g., idempotent, at-least-once).
- Named output 2 — …

## Edge Cases

Enumerate every known edge case. Each edge case MUST have a corresponding test in `/tests/`.

1. Case: … → Expected behavior: …
2. Case: … → Expected behavior: …

## Safety Constraints

- What must NEVER happen.
- Rate limits, resource ceilings, irreversible-action guards.

## Verification Expectations

- Unit tests at `/tests/unit/<area>/*.test.ts`
- Integration tests at `/tests/integration/<area>/*.test.ts`
- E2E coverage: yes/no — path if yes.
- Manual verification steps (if any).

## Dependencies

- Upstream directives this relies on.
- External systems (Postgres, Redis, Stripe, etc.).

## Change Log

- YYYY-MM-DD — Created.

# Directive 001 — Sprint Process

**Status:** active
**Owner:** Technical Lead
**Sprint:** 0
**Last Updated:** 2026-04-13

---

## Goal

Define the deterministic per-sprint process every contributor (human or AI agent) MUST follow so that shipping behavior is reproducible, auditable, and test-backed per CLAUDE.md.

## Inputs

- Sprint backlog (from plan file).
- Current state of `/directives/`, `/services/`, `/tests/`.
- `/tmp/autonomy_log.json` from prior sprints.

## Outputs

- At least one new or updated directive under `/directives/`.
- Tests in `/tests/{unit,integration,e2e}/` — red-before-green.
- Implementation under `/services/<service>/` or `/execution/`.
- Appended entry in `/tmp/autonomy_log.json`.
- Updated CI status: green.

## Required Order of Operations

Per CLAUDE.md — directives ARE tests ARE code in that order. No skipping.

1. **Draft or update directive** — copy `000-directive-template.md`, fill in goal/inputs/outputs/edge cases/safety constraints.
2. **Write failing tests** — unit + integration covering every edge case in the directive.
3. **Implement deterministic execution code** — smallest change to turn tests green.
4. **Validate** — `npm run format:check && npm run lint && npm run typecheck && npm test`.
5. **Log autonomy entry** — append to `/tmp/autonomy_log.json` matching `tmp/autonomy_log.schema.json`.
6. **Open PR** — CI must pass before merge.

## Edge Cases

1. Tests pass on first write (never went red) → treat as suspicious; write a test that fails against the un-implemented path to prove coverage.
2. Implementation requires a new paid external dependency → STOP; this is a governance boundary. Write `/tmp/escalation.json` and invoke `execution/notify_owner.ts`.
3. Implementation requires >25% rewrite of an existing module → STOP; escalate.
4. Confidence score < 0.65 at plan time → enter Diagnostic Mode per CLAUDE.md §Diagnostic Mode.
5. Same failure repeats 3+ times → stall detected; enter Diagnostic Mode.

## Safety Constraints

- NEVER commit secrets (`.env`, credentials, API keys).
- NEVER bypass CI gates (`--no-verify`, force push to main).
- NEVER skip the directive step — undocumented behavior is forbidden.
- NEVER delete or rewrite an active directive without bumping its change log.

## Verification Expectations

- CI workflow (`.github/workflows/ci.yml`) enforces format/lint/typecheck/test/terraform-validate.
- `npm run daily-report` produces a non-empty `DailyReport` after at least one autonomy log entry exists.
- Sentinel test `tests/unit/sentinel.test.ts` MUST remain green at all times.

## Dependencies

- CLAUDE.md (project root) — operating contract.
- `000-directive-template.md` — template every new directive extends.
- `tmp/autonomy_log.schema.json` — log entry contract.
- `tmp/escalation.schema.json` — escalation payload contract.

## Change Log

- 2026-04-13 — Created in Sprint 0.

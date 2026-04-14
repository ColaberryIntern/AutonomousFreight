# Autonomous Freight

Freight-broker SaaS platform. Built under the **Governed Autonomous v2** operating contract defined in [`CLAUDE.md`](CLAUDE.md) and the product scope in [`Autonomous_Freight_Build_Guide_v1.md`](Autonomous_Freight_Build_Guide_v1.md).

## Layer model

| Layer             | Directory                                            | Purpose                                                     |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| 1 — Directives    | [`directives/`](directives/)                         | Human-readable SOPs. Every capability MUST have one.        |
| 2 — Orchestration | Claude / AI agents                                   | Plans, tests, and modifies — never executes business logic. |
| 3 — Execution     | [`execution/`](execution/), [`services/`](services/) | Deterministic scripts & services.                           |
| 4 — Verification  | [`tests/`](tests/)                                   | Unit, integration, E2E. First-class citizens.               |

## Quick start

```bash
# 1. Install
npm ci

# 2. Local infra (Postgres + Redis)
docker compose up -d

# 3. Copy env template
cp .env.example config/development.env

# 4. Verify foundation
npm run format:check
npm run lint
npm run typecheck
npm test
```

## Adding a new directive

1. `cp directives/000-directive-template.md directives/NNN-your-topic.md`
2. Fill in Goal, Inputs, Outputs, Edge Cases, Safety Constraints, Verification.
3. Write failing tests in `tests/` that cover every edge case.
4. Implement the smallest change under `services/<svc>/` or `execution/` to make tests pass.
5. Append an entry to `tmp/autonomy_log.json` matching [`tmp/autonomy_log.schema.json`](tmp/autonomy_log.schema.json).
6. Open PR — CI must be green.

Full process: [`directives/001-sprint-process.md`](directives/001-sprint-process.md).

## Sprint plan

See the current plan at `C:/Users/ali_m/.claude/plans/proud-finding-feather.md`.

Current sprint: **Sprint 0 — Foundation** (complete as of 2026-04-13).

Next: **Sprint 1 — User Identity & RBAC**.

## Commands

| Command                    | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `npm test`                 | Unit tests.                                            |
| `npm run test:integration` | Integration tests (requires Postgres + Redis running). |
| `npm run test:e2e`         | E2E tests (Sprint 2+).                                 |
| `npm run lint`             | ESLint, zero warnings.                                 |
| `npm run typecheck`        | `tsc --noEmit`.                                        |
| `npm run format`           | Prettier write.                                        |
| `npm run daily-report`     | Executive summary from autonomy log.                   |

## Governance

- **Escalation:** strategic boundaries only (schema redesign, new paid dependency, AI model class change, >25% module rewrite). Mechanism: write `tmp/escalation.json`, run `execution/notify_owner.ts`.
- **Autonomy log:** every meaningful change appends to `tmp/autonomy_log.json`.
- **Stall detection:** same failure 3x or 2 loops with no meaningful diff → Diagnostic Mode per CLAUDE.md.

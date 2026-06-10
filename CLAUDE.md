# CLAUDE.md
**Colaberry Agent Project Rules, QA Model & Operating Contract (Governed Autonomous v2)**

This file defines how Claude (and other AI coding agents) must behave when working in this repository. This project does NOT use Moltbot. Claude Code and other coding agents are used to design, build, validate, and maintain the system, they are not the runtime system itself.

---

# Core Principle

LLMs are probabilistic. Production systems must be deterministic.

Claude's role: reason, plan, orchestrate, validate, and modify instructions/code carefully and audibly. Claude is never the runtime executor of business logic, tests, or workflows.

**Operating bias: proceed by default.** Pause only when a governance boundary is crossed, a strategic constraint is unclear, or an irreversible decision is required. Claude is a senior autonomous engineer, not a junior developer seeking permission for implementation details.

---

# Architecture & System Layers

**Model:** Agent-First, Deterministic-Execution with Test-First Validation.

| Layer | Role | Location in this repo | Notes |
|---|---|---|---|
| 1. Directives | What to do (SOPs) | `/directives` | Human-readable. Define goals, inputs, outputs, edge cases, safety constraints, verification expectations. Living documents. |
| 2. Orchestration | Decision making | Claude itself | Plans changes, designs tests before logic, updates directives, escalates only for strategic decisions. Never executes business logic directly. |
| 3. Execution | Doing the work | `backend/src/`, `frontend/src/`, `backend/src/scripts/`, `/scripts` | Deterministic scripts and services. Repeatable, testable, auditable, safe to rerun. |
| 4. Verification | Proving it works | `/tests` (Playwright in `/tests/systemV2`), `tsc --noEmit` | Unit, integration, E2E. Tests are first-class citizens, not afterthoughts. |

The legacy top-level `/execution` and `/agents` folders referenced in earlier versions of this file do not exist in this repo. Execution code lives inside `/backend` and `/frontend` (the actual stack); one-off operational scripts live in `/scripts` or `backend/src/scripts/`.

---

# Folder Responsibilities

Claude must respect these boundaries.

- **`/backend`** - Node.js + Express + TypeScript backend. Subfolders:
  - `backend/src/services/` - business logic services (alumni, briefings, openclaw outreach agents, content generation, etc.)
  - `backend/src/services/agents/` - agent orchestration (openclaw subtree, intelligence subtree, marketing subtree)
  - `backend/src/intelligence/` - planning, prompt generation, decision engines
  - `backend/src/scripts/` - one-off operational scripts (`sendXxx.js`, `basecampXxx.js`, `fixXxx.js`, etc.). Disposable but auditable. Each script has a single clear responsibility.
  - `backend/src/seeds/` - seed data and migration scripts
  - `backend/src/routes/` - Express route definitions (admin, portal, public)
  - `backend/src/models/` - Sequelize models
  - `backend/src/config/`, `backend/src/middleware/` - infra wiring
- **`/frontend`** - React + CRA + TypeScript frontend. Subfolders:
  - `frontend/src/pages/` - top-level page components
  - `frontend/src/components/` - reusable UI
  - `frontend/src/routes/` - public, admin, portal route trees
  - `frontend/src/services/` - frontend API clients
  - `frontend/src/contexts/`, `frontend/src/styles/` - cross-cutting concerns
- **`/scripts`** - Repo-root operational scripts (deploy helpers, ad-hoc data pulls, full-inbox-scan, weekly reports). Same single-responsibility rule as `backend/src/scripts/`.
- **`/directives`** - SOPs and runbooks. Step-by-step, human-readable. Must define how success is verified.
- **`/tests`** - Automated verification layer. Currently includes Playwright/browser flows in `/tests/systemV2`. Future API contract and visual regression tests live here.
- **`/docs`** - In-repo documentation that ships with the codebase (architecture notes, integration guides, system docs).
- **`/nginx`** - Production nginx config (multi-stage Docker build context).
- **`/tmp`** - Scratch space. Always safe to delete. Never committed.

No business logic in directives. No orchestration in disposable scripts. No execution or testing inside Claude responses.

---

# Contract Enforcement Layer (NEW)

Every module exposes a contract. The contract is the API: input shape, output shape, error shape, side effects. Contracts are code, not prose.

- Every public function, route, or service exposes typed inputs and typed outputs. TypeScript types, Zod schemas, or JSON Schema. Pick one consistently per module.
- No untyped inputs at module boundaries. `any` is never a contract.
- No ambiguous outputs. If a function can return `T | null | undefined | { error: ... }`, the contract names every variant.
- Contracts must be testable. A contract violation should fail a unit test, not a customer interaction.
- **Breaking contract = failing build.** `tsc --noEmit` fails, schema validation throws, integration test red. The build catches it.
- External API consumers (Mandrill, Basecamp, MSSQL) get an internal adapter with its own contract. Upstream changes do not leak into our domain types.

---

# Modular Composition Rule

Composition is preferred over inheritance, and small modules are preferred over large ones.

| Guidance | Soft limit |
|---|---|
| File size | ~300 lines |
| Function size | ~50 lines |
| Cyclomatic complexity per function | < 10 |

These are guidelines, not enforced gates. Crossing them is not a violation; it is a smell that warrants a second look.

**Hard rules:**

- One responsibility per module. If the filename needs an "and" to describe it, split it.
- No circular dependencies. Module A imports B; B never imports A back.
- Extract reusable logic into shared services or utility modules. Copy-paste across two call sites is acceptable; three is not.
- Public exports are intentional. If it does not need to be public, do not export it.

---

# Production Readiness Principles (12-Factor Adapted)

Adapted from the 12-Factor App methodology for this stack. Not all 12 factors apply to a Node, Sequelize, CRA monorepo; the ones below do.

- **Config separated from code.** Secrets in env vars (production container env, Mandrill, MSSQL credentials). Never in source. Local dev uses `.env`, never committed.
- **Stateless execution where possible.** Services do not hold session state in memory. State lives in the DB. Worker scripts load state on start, persist on exit, never assume in-memory continuity across runs.
- **Idempotent processes.** See dedicated section below. Every script must survive being run twice.
- **Logs as structured event streams.** JSON to stdout. The container or platform aggregates. Never a custom log file path the platform cannot see.
- **Dev/prod parity.** Same Node version, same Postgres major version, same nginx config. Differences are documented and minimized. No "works on my machine" excuse.
- **Explicit dependencies.** `package.json` is authoritative. No global npm installs in scripts. No system tools assumed beyond the standard Linux base image.
- **Single responsibility scripts.** One `sendXxx.js` per email type. One `fixXxx.js` per data fix. Disposable, named after intent, composable.

---

# Idempotency & Replayability (NON-NEGOTIABLE)

Every script, every worker, every webhook handler must satisfy:

- **Safe to run multiple times.** No catastrophic side effect on the second run.
- **Same input = same output.** No hidden randomness, no untracked clock dependence.
- **No duplicate side effects.** Sending the same email twice is a violation. Inserting the same row twice is a violation. Use idempotency keys, unique constraints, or check-then-act patterns.
- **Idempotency keys required** for any operation that touches an external system. Mandrill sends use a deterministic message-ID. Basecamp creates check for existing first. Webhook handlers dedupe by event ID.
- **Retry-safe design.** A failed run mid-execution must be retriable without manual cleanup. Use transactions where possible. Use journaled progress where transactions are not.

> **Violations = production defect.** Treat duplicate sends, duplicate rows, or non-replayable workers as P1 incidents.

---

# Autonomy Model

## Strategic decisions (ESCALATE)

Escalation required when decisions affect:

- Business model, architecture layer structure, cross-module dependency shifts
- Database engine or schema redesign
- External dependency introduction, paid external services
- Compliance or security posture
- Production infrastructure or environment modification
- Non-functional requirement thresholds, cost model shifts
- AI model class changes
- Large refactors (>25% module rewrite)

These are governance boundaries. Autonomy does not override governance.

## Implementation decisions (PROCEED)

Claude must proceed autonomously for:

- Naming, helper structure, internal patterns, default parameter values
- Test structure, refactoring within a module, readability improvements
- Adding missing validations, extending non-breaking interfaces
- Logging structure, minor configuration adjustments
- Small performance improvements, localized bug fixes
- Any reversible change with low blast radius

If the change is reversible AND blast radius is local AND no governance boundary is crossed AND tests validate behavior, then proceed without asking. Escalation is prohibited for implementation-level ambiguity.

## Default resolution strategy

When multiple reasonable paths exist: prefer (1) simplest, (2) deterministic, (3) lowest blast radius, (4) highest testability. Log the assumption and proceed. Do not ask clarifying questions for implementation-level reversible decisions.

## Scope lock

Do not expand scope beyond directives. If scope expansion is detected: log the proposal, continue current scope work, escalate separately for expansion approval. Scope expansion must never block implementation progress.

---

# Confidence, Diagnostic Mode & Stall Detection

## Confidence scoring

Claude internally evaluates: directive clarity, test coverage strength, reversibility, architectural blast radius, compliance/security impact.

| Score | Action |
|---|---|
| > 0.80 | Proceed autonomously |
| 0.65 - 0.80 | Proceed + log assumptions |
| < 0.65 | Enter Diagnostic Mode |

Low confidence alone does not trigger escalation. Escalation occurs only if Diagnostic Mode resolution would cross a governance boundary.

## Silent assumption allowance

Up to **5 local implementation assumptions per iteration** are allowed if each is logged, tests validate behavior, and no governance boundary is crossed. More than 5 required, enter Diagnostic Mode. This prevents decision paralysis.

## Diagnostic Mode (steps)

1. Root cause analysis
2. Minimal corrective change
3. Add protective test
4. Retry once
5. Log reasoning

Escalate only if architectural boundary crossed, governance rule triggered, or irreversible change required.

## Stall detection

A stall = same failure 3 times, OR no meaningful diff across 2 loops, OR no progress within iteration window. Response: enter Diagnostic Mode (above). If unresolved AND strategic, escalate. **Infinite retry loops are prohibited.**

---

# Escalation Protocol

Claude must never halt silently. Escalation must be rare and high-signal.

**Triggers** (any one):
- Architecture pattern conflict, schema redesign, external dependency required
- Compliance/security boundary touched, production infrastructure change
- Repeated failure after Diagnostic Mode
- Directive conflict affecting system behavior
- Strategic ambiguity affecting future constraints
- Any item from the Strategic Decisions list above

**Process:**
1. Write `/tmp/escalation.json` with: problem summary, root cause, options, risks, recommendation, required decision
2. Notify the owner. Until a dedicated `notify_owner` worker exists in `/backend`, the operational substitute is a Mandrill email to `ali@colaberry.com` containing the escalation contents.
3. Continue work that is not blocked by the escalation.

---

# Failure-First Design (NEW)

Every system defines its failure behavior before its success behavior.

- **Define failure modes explicitly.** What does this code do when its input is bad, its dependency is down, its disk is full, its rate limit is hit? If the answer is "I am not sure," the design is incomplete.
- **Retry strategy required.** Document the policy: how many retries, with what backoff, against what error categories. Transient errors retry. Validation errors do not.
- **Recovery path required.** When a job fails permanently, what restores the system? Manual replay? Re-run the script? Mark the row as `needs_review`? Specify it.
- **No silent failures.** Errors surface to logs, to PROGRESS.md (if persistent), to escalation (if strategic). Try/catch that swallows the error without logging is a defect.

A feature is not designed until its failure paths are designed.

---

# Testing & Validation Rules

Testing is mandatory and gated. Claude designs tests; tools execute them. The current state of this repo does not yet meet the full target standard. The rules below describe both the **target** and the **minimum acceptable now**.

## Unit testing

- **Target:** All non-trivial logic in `backend/src/services/` and `backend/src/intelligence/` has unit tests. Pure logic tested without I/O; external dependencies mocked. Fast, deterministic, runnable locally.
- **Minimum now:** Any new business logic added to those folders ships with at least one unit test covering the happy path. Existing untested code is grandfathered until it is touched.

## Integration testing

- May touch dev sandboxes, test databases, mock APIs.
- Must NEVER touch production.
- Requires explicit opt-in (env flag or CI label).

## End-to-End & UI testing

Validates routing, links, forms, auth flows, permissions, UI state. Browser automation (Playwright) is used in `/tests/systemV2`. Claude may generate crawl tests, define form test matrices, design visual regression rules. Claude must NOT manually simulate UI behavior in prose. For UI changes, type-checking (`tsc --noEmit`) is the minimum gate; Playwright coverage is the target.

## Worker / scheduled-job testing

Workers and scheduled jobs (Cory briefings, content generation, intelligence runs, openclaw outreach) are tested as routing logic: correct script selection, retry behavior, idempotency, error handling. Workers must never send real communications during tests; use the test-mode flag on Mandrill scripts and the no-op flag on briefing services.

## Directive validation

Directives in `/directives` validated for: required sections, referenced files/scripts existence, markdown integrity, clarity for junior developers.

If behavior can be tested via code, do not validate it narratively.

---

# Test Strategy Framework (NEW)

Tests are weighted by risk and cost. The pyramid is the default; deviations require justification.

| Layer | Target % | Coverage |
|---|---|---|
| Unit | 70% | Pure logic, no I/O. Fast, deterministic, run on every save. |
| Integration | 20% | Real DB, real adapters, mocked external APIs where reasonable. CI-gated. |
| E2E (Playwright) | 10% | Full browser flows. Auth, routing, form submission, permission gates. |

**Risk-based testing requirement.** Every change classifies its blast radius. Production-critical paths (auth, billing, outbound email, paid agents) carry mandatory E2E coverage even if unit and integration would otherwise be sufficient.

**Mandatory test types per feature:**

- **Happy path** - the intended success flow
- **Failure path** - what happens when the dependency fails, the input is malformed, the network is down
- **Boundary cases** - empty arrays, nulls, max-length strings, off-by-one ranges, timezone edges
- **Idempotency validation** - run the operation twice, assert no duplicate side effects (see Idempotency & Replayability)

If any of the four is impractical, document why in the test file header. Skipping silently is a violation.

---

# Logging, Reporting & Progress Tracking

This section is **gated**. Failure to update progress is a process violation, not an oversight, and blocks Definition of Done.

## Per-change autonomy log (target)

When the autonomy log writer lands in `/backend`, every change appends one entry to `/tmp/autonomy_log.json`:

```json
{
  "timestamp": "ISO-8601",
  "change_summary": "what was done",
  "files_touched": ["..."],
  "assumptions": ["..."],
  "confidence": 0.0,
  "tests_added": ["..."],
  "directives_updated": ["..."],
  "escalation_triggered": false
}
```

Until that writer exists, Claude must include the same information in the commit message body and the corresponding PROGRESS.md note. The autonomy_log gate becomes a hard Definition of Done requirement once the writer ships.

## PROGRESS.md update rule (HARD GATE, ENFORCED NOW)

After every completed implementation change, before marking the change "done" in any sense, Claude MUST update `PROGRESS.md`. Non-compliance is a violation, not a forgetting.

**What goes in `PROGRESS.md`:** code, prompts that ship, infra/config that affects runtime, in-repo docs.

**What does NOT go in `PROGRESS.md`:** Mandrill emails sent on Ali's behalf, Basecamp ticket creation, ad-hoc data pulls, memory file additions, discovery/dry-run script outputs that don't ship, external API calls that don't land code, deploy commands shipping already-tracked code.

**Required entry format** (append under the relevant task):

```markdown
- [x] <task name>
  - Date: YYYY-MM-DD
  - What changed: <one line>
  - Verification: <test name | deploy URL | "user confirmed" | "TypeScript passes">
  - Notes: <only if blocker, deviation, or non-obvious decision>
```

**Hard gates:**
1. **No code change is "done" without a PROGRESS.md entry.** Definition of Done explicitly blocks on this.
2. **No `[x]` mark without verification evidence on the same line.** Forbidden: marking complete based on intent. Required: a concrete artifact (test result, deploy confirmation, user statement, or `tsc` pass).
3. **Every commit that touches `/backend`, `/frontend`, `/scripts`, `/nginx`, or `/directives` must also touch `PROGRESS.md`.** If it doesn't, the change is incomplete.
4. **End-of-session audit (REQUIRED):** Before ending any session, Claude must:
   - List every file modified in the session
   - Confirm each modification has a corresponding PROGRESS.md entry
   - If any entry is missing, write it before ending
   - State explicitly in the session-end summary: "PROGRESS.md audit: N changes, N entries, audit clean."

If PROGRESS.md does not exist, create it before doing any work.

## Catch-up rule

If a session has done implementation work without updating PROGRESS.md along the way, write a single end-of-session entry covering everything that landed, dated for the day the work was done. Better to log late than not at all.

## Session start protocol

At the start of every session:
1. Read `CLAUDE.md` (this file) fully
2. Read `PROGRESS.md` fully
3. Summarize current state and the first unchecked task
4. **Make no code changes during this step**

## Verification rule

Before any coding work begins: confirm both files exist, read both fully, summarize the rules and progress. No code changes during verification.

## Daily executive report

The daily executive report concept in this repo is implemented as the **Cory briefing** service in `backend/src/services/`. The briefing emails Ram and Ali via the `admin_notification_emails` setting and covers: completed work, tests added, failures resolved, architectural changes, confidence averages, assumptions made, risk flags, open escalations, next milestones. Claude does not send notifications directly; the briefing service does.

---

# Observability Framework (NEW)

If you cannot observe it, you cannot operate it.

**Required for every service, worker, and script:**

- Structured logging in JSON. One event per significant action. Required fields: `timestamp`, `service`, `event`, `correlation_id`, `outcome`.
- Execution duration tracking. Wrap meaningful units of work with start/end timestamps; log the delta.
- Success / failure status. Every operation logs an explicit outcome. No silent passes.
- Error classification. Errors are tagged: `transient`, `validation`, `auth`, `external_api`, `internal_bug`. The category drives retry behavior.

**Required metrics (per service, per worker):**

| Metric | Definition |
|---|---|
| success rate | successful operations / total attempts, last N minutes |
| failure rate | failed operations / total attempts, last N minutes |
| retry count | how many times each operation was retried before settling |
| latency | p50 / p95 / p99 wall-clock time |

**Correlation IDs (NON-NEGOTIABLE).** Every request, job, or message originates a correlation ID. The ID propagates through every log line, every downstream call, every audit row. Tracing a customer issue requires one ID, not detective work.

---

# UI/UX Design Policy

## Design system

- **Framework:** Bootstrap 5 (CDN), utility-first. No custom CSS unless a class exists in `global.css`
- **Tokens:** All colors, fonts, spacing as CSS custom properties in `frontend/src/styles/global.css`
- **Never hardcode hex values.** Use `var(--color-*)` or Bootstrap utility classes

## Color palette

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#1a365d` | Navy: headings, primary buttons, brand |
| `--color-primary-light` | `#2b6cb0` | Links, hover states, focus outlines |
| `--color-secondary` | `#e53e3e` | Red: CTAs, warnings, destructive actions |
| `--color-accent` | `#38a169` | Green: success states, positive indicators |
| `--color-bg` | `#ffffff` | Page background |
| `--color-bg-alt` | `#f7fafc` | Alternate section backgrounds |
| `--color-text` | `#2d3748` | Body text |
| `--color-text-light` | `#718096` | Muted/secondary text |
| `--color-border` | `#e2e8f0` | Card borders, dividers |

## Component patterns

- **Cards:** `card border-0 shadow-sm` with `card-header bg-white fw-semibold`
- **Tables:** `table-responsive > table table-hover mb-0`, `thead table-light`
- **Badges:** `badge bg-{success|warning|info|secondary|danger}`
- **Tabs:** `nav nav-tabs mb-4` with `nav-link active` buttons
- **Modals:** `modal show d-block` with backdrop, `role="dialog"`, `aria-modal="true"`
- **Forms:** `form-control-sm`, `form-select-sm`, `form-label small fw-medium`
- **Buttons:** Always `btn-sm` in admin UI; `btn-primary`, `btn-outline-secondary`, `btn-outline-danger`
- **Filter bars:** `d-flex gap-2 mb-3 flex-wrap align-items-center`

## Accessibility (WCAG 2.1 AA required)

- **Focus indicators:** `3px solid var(--color-primary-light)` on `:focus-visible` (in `responsive.css`)
- **Touch targets:** Min 44x44px on mobile (in `responsive.css` for `< 992px`)
- **Reduced motion:** `prefers-reduced-motion: reduce` disables animations (in `responsive.css`)
- **High contrast:** `prefers-contrast: high` adds borders and full-contrast text (in `responsive.css`)
- **Screen readers:** Loading spinners need `role="status"` + `visually-hidden` text

## Available design skills

| Skill | Invocation | Purpose |
|---|---|---|
| Baseline UI | `/baseline-ui` | Output the complete design system reference |
| Accessibility | `/fixing-accessibility` | WCAG 2.1 AA audit and remediation |
| Performance | `/fixing-motion-performance` | Animation, rendering, bundle optimization |
| Frontend Design | `/frontend-design` | Generate React + Bootstrap components and pages |
| UI/UX Design | `/ui-ux-design` | Strategic design: research, wireframes, prototyping, review |

## Target audience

**Enterprise executives, aged 35-60.** Design must be clean, calm, and authoritative. Prioritize scannable information density, progressive disclosure, and professional tone. Think Bloomberg meets Salesforce, not consumer SaaS.

---

# Security Enforcement Layer

Security is a design property, not a bolt-on.

- **Input validation at every boundary.** Every Express route, every webhook handler, every script that takes an argument validates inputs before doing work. Zod or equivalent. Reject malformed requests with a typed error, not a stack trace.
- **No unsafe queries.** Sequelize ORM operations preferred. If raw SQL is necessary, use parameterized queries. String concatenation into a query is a violation regardless of who wrote it.
- **No secrets in code.** Mandrill API keys, MSSQL credentials, Basecamp tokens, OAuth refresh tokens live in container env vars or in audited stores (the `Basecamp_AuthInfo` MSSQL pattern). Never in source, never in commit messages, never in PROGRESS.md.

**External calls must include:**

- **Timeout.** No request without a hard upper bound. 10 to 30 seconds for HTTP, 60 seconds for SMTP.
- **Retry.** With backoff, against retryable error categories only.
- **Error handling.** A failed external call surfaces a typed error to the caller, not a thrown raw HTTP error.

---

# Tooling Assumptions

Claude may assume:
- Claude Code is available
- VS Code / VSCodium / Cursor may be used
- Git is present
- CI runs automated tests where they exist (manual testing is the current default for most surfaces)
- Production VPS access is via `ssh root@95.216.199.47` to the stack at `/opt/colaberry-accelerator`. Deploys are `git pull origin main && docker compose -f docker-compose.production.yml up -d --build [service]`.

Claude must NOT assume:
- Moltbot exists
- Proprietary automation platforms exist
- Production credentials exist locally (Mandrill, MSSQL, Basecamp tokens live in the prod backend container env, not in the local repo)

---

# Intern Safety Rules

This repository may be worked on by interns.

- No destructive scripts without confirmation
- No production writes without explicit environment checks
- No secrets in repo
- Clear setup docs must exist
- One-command test execution must exist

Optimize for clarity, reproducibility, and teachability.

---

# Build-Break-Harden Loop (CORE EXECUTION MODEL)

This is how features actually ship.

1. **BUILD.** Implement the feature. Happy path first. Get it working end-to-end.
2. **BREAK.** Simulate failure. Bad input. Dependency down. Network drops. Rate limit hit. Race condition. Whatever the realistic threats are.
3. **HARDEN.** Add the protections that the BREAK step revealed: input validation, retry, timeout, idempotency check, failure path, monitoring, alert.

> **Rule:** A feature is NOT complete until it survives failure testing.

The Definition of Done already requires tests; this rule sharpens what those tests cover. Happy-path-only test coverage marks a feature "done" while it is one bad input away from a production defect. The BREAK and HARDEN steps are mandatory before a feature can be marked complete in PROGRESS.md.

---

# Definition of Done & Self-Strengthening

A change is complete only if ALL of the following are true:

- Tests exist and pass at the minimum standard for the layer (see Testing & Validation Rules)
- Directives updated if necessary
- No secrets introduced
- Validation scripts pass (`tsc --noEmit` for TypeScript layers)
- A junior developer can understand the change
- Assumptions logged (if any)
- No unresolved governance boundary crossed
- **PROGRESS.md updated with verification evidence (Logging section, hard gate, enforced now)**
- **`/tmp/autonomy_log.json` entry appended (when the writer lands; until then, the same information is in the commit body and PROGRESS.md note)**

## Self-strengthening requirement

Each autonomous change should leave the system stronger: add missing tests, clarify ambiguous directives, refactor recurring failure patterns, reduce future ambiguity, improve determinism, reduce future need for escalation. Failures are inputs, not mistakes.

---

# Summary

Claude is the planner, validator, and system hardener, not the worker.

- Directives define intent
- Scripts and services execute deterministically
- Tests prove correctness
- Long-running services run the system
- PROGRESS.md and autonomy logs prove what happened
- Implementation ambiguity does not trigger escalation
- Strategic ambiguity does
- Escalation replaces paralysis

Be deliberate. Be testable. Be autonomous. Be governed only where necessary.

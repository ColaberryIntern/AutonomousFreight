# /tmp — Governance runtime artifacts

This directory holds ephemeral artifacts that CLAUDE.md requires to exist:

- `autonomy_log.json` — append-only log of autonomous changes. Schema: `autonomy_log.schema.json`.
- `escalation.json` — written only when a strategic boundary is crossed. Schema: `escalation.schema.json`.

**Committed:** the two schema files, this README.
**Gitignored:** `autonomy_log.json` and `escalation.json` runtime content (see root `.gitignore`).

Why gitignore the content? These are per-developer/per-CI-run runtime state, not shared source. The schemas and daily aggregated reports are the shared, durable artifacts.

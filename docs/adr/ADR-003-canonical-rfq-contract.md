# ADR-003: Canonical RFQ payload as a Zod v1 contract

- Status: Accepted
- Date: 2026-07-02
- Deciders: Ali, Karun (Gate 1 review pending)

## Context

The RFQ payload is the keystone of the forward track. Every RMS producer and OMS
consumer depends on it; downstream work is "built on sand" until it is a typed
contract (BC RMS-W1). A JSON Schema already existed at
`docs/dat-rfq-payload-schema.json` with three worked examples, but a JSON Schema
is not enforced at the TypeScript boundary and is not a runtime guard.

## Decision

Realize the canonical RFQ as a Zod v1 contract at
`services/rms/src/schema/rfq.v1.ts`, the runtime + type-level twin of the JSON
Schema. Key choices:

- `parseRfq(input: unknown)` is the only sanctioned entry point. It returns a
  typed value or a typed error list, never `any` and never a throw (CLAUDE.md
  Contract Enforcement Layer).
- `.strict()` everywhere mirrors `additionalProperties: false`, so a producer or
  consumer adding an unmodeled field fails validation instead of drifting
  silently.
- Plural-by-default: `stops[]`, `commodities[]`, `equipmentOptions[]`,
  `serviceTypes[]`, `contacts[]`, `windows[]`.
- Route sanity refinements: first stop is a pickup, last stop is a delivery.
- Format validators are refine-based (not Zod's evolving string-format API) so
  the contract compiles deterministically across Zod minor versions.

The three worked examples validate against the contract as a regression test.

## Consequences

- Typed contracts at the RMS/OMS boundary from day one; contract violations fail
  a unit test, not a customer interaction.
- The parser (`emailParser.ts`) and Karun's future D1-D33 parser both target the
  same output contract, so the higher-fidelity parser drops in without touching
  consumers.
- Bumping the schema is a versioned change (rfq.v2) with its own ADR, not an
  in-place edit.

## Alternatives considered

- Keep only the JSON Schema and validate with ajv: rejected, no type-level
  enforcement in TypeScript and an extra runtime dependency; Zod gives both.
- Hand-written TypeScript interfaces with no runtime validation: rejected, no
  runtime guard at the ingestion boundary where untrusted email data enters.

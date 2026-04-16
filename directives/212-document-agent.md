# Directive 212 — Document Agent

**Status:** active
**Owner:** Backend / Agents
**Phase:** V-3
**Last Updated:** 2026-04-16

---

## Goal

Fourth named agent (V5 §5). When a shipment reaches `delivered`, the Document Agent validates evidence documents (BOL number, date, freight class) using the `extractBolFields()` regex parser built in Sprint 16. If validation passes, the shipment is marked `doc_verified`; if it fails, an exception is raised for human review.

## Behavior

Every 5s tick:

1. Find shipments in `delivered` status that have NOT been doc-verified.
2. For each, check if a `shipment_documents` row exists with `doc_type = 'bol'`.
3. If BOL exists → run `extractBolFields(text)` on the document text.
4. If bolNumber is present AND date is present → mark shipment `doc_verified` (new status). Audit `agent.document.verified`.
5. If extraction fails (null fields) → audit `agent.document.exception`. Stays `delivered` for HITL review.
6. If no BOL doc uploaded → skip (waiting for document).

## Schema additions

New status `doc_verified` added to shipments CHECK constraint.

New `shipment_documents` table:

| Column           | Type                       |
| ---------------- | -------------------------- |
| id               | BIGSERIAL PK               |
| shipment_id      | UUID FK → shipments        |
| doc_type         | TEXT (bol / pod / invoice) |
| raw_text         | TEXT                       |
| extracted_fields | JSONB                      |
| uploaded_at      | TIMESTAMPTZ DEFAULT NOW()  |

New endpoint: `POST /api/v1/shipments/:id/documents` — upload a document (body `{ docType, rawText }`). RBAC: admin/broker.

## Edge Cases

1. Multiple BOL uploads → latest one wins (agent re-validates).
2. Shipment not in `delivered` → upload accepted but agent won't process until delivery.
3. Extracted fields partially present (date but no BOL#) → exception.
4. Empty raw_text → exception immediately.

## Safety Constraints

- Document parser treats input as inert text (directive 160 constraint).
- `doc_verified` is a prerequisite for future invoice generation (V-4).
- Agent NEVER auto-transitions backward from `doc_verified`.

## Verification

- Unit: extractBolFields already tested in Sprint 16.
- Integration: upload BOL → agent tick → shipment `doc_verified` + audit row.

## Change Log

- 2026-04-16 — Created in V-3.

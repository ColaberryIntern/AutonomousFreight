# Directive 040 — Event Bus

**Status:** active
**Owner:** Platform / Events
**Sprint:** 4
**Last Updated:** 2026-04-14

---

## Goal

Provide a typed, minimal-contract publish/subscribe primitive so services can communicate without direct coupling. Sprint 4 ships an in-process `InMemoryEventBus`. An AMQP/RabbitMQ adapter is authored as Terraform + client scaffolding but **not wired in runtime** — that happens in Sprint 13 when services separate into distinct Kubernetes pods.

## Inputs

- A published `DomainEvent`: `{ name, version, payload, occurredAt, traceId? }`.
- Subscriber callback signature: `(event) => Promise<void> | void`.

## Outputs

- Every subscribed handler for a given `name` is invoked exactly once per published event (best-effort, in-process).
- Publish is fire-and-forget from the caller's perspective: failures inside a handler MUST NOT bubble back to the publisher (they are logged instead).
- A schema registry validates payloads using zod at publish time — invalid payloads throw synchronously so bugs surface in tests.

## Event Catalog (v1)

| Name                        | Version | Payload                                                                                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `user.registered`           | 1       | `{ userId: UUID, email: string, roles: string[] }`                                                                                   |
| `shipment.carrier_selected` | 1       | `{ shipmentId: UUID, carrierId: UUID, score: number }` (reserved; publisher added in a future sprint when shipment assignment lands) |

## Edge Cases

1. Publish with no subscribers → silent success (events are not stored).
2. Handler throws → error logged with `traceId`; other handlers still run; publisher unaffected.
3. Payload fails schema validation → publish throws synchronously; caller must handle.
4. Same handler subscribed twice → invoked twice (we do not dedupe; caller's responsibility).
5. Unsubscribe during delivery → next publish does not invoke the unsubscribed handler; in-flight delivery completes.

## Safety Constraints

- NEVER block the publishing request path on handler completion — publishes are async in the caller.
- NEVER include PII the event receiver does not need (principle of least data).
- NEVER persist events to disk in v1 — durability and replay are Sprint 13 concerns.
- NEVER couple services to the bus implementation; always depend on the `EventBus` interface.

## Verification Expectations

- Unit tests: `tests/unit/events/inMemoryBus.test.ts`, `tests/unit/events/schema.test.ts`.
- Integration: `tests/integration/notifications/userRegistered.test.ts` exercises the bus via the register endpoint.

## Dependencies

- `zod` for payload schema.

## Change Log

- 2026-04-14 — Created in Sprint 4.

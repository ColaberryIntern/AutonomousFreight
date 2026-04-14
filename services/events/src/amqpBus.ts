/**
 * AMQP/RabbitMQ adapter — SKELETON.
 *
 * Sprint 4 scope: file exists, types compile, but the runtime path is NOT wired
 * into the gateway. Sprint 13 (Kubernetes migration) replaces InMemoryEventBus
 * with this implementation so the Notification Service can run out-of-process.
 *
 * Connect / channel / exchange / queue management intentionally elided. Do not
 * use this class in production without the Sprint 13 hardening (connection
 * recovery, consumer acks, dead-letter queue, idempotency key).
 */
import type { DomainEvent, EventBus, EventHandler } from './types';

export interface AmqpConfig {
  url: string;
  exchange: string;
}

export class AmqpEventBus implements EventBus {
  constructor(private readonly cfg: AmqpConfig) {
    void this.cfg;
  }

  publish<TPayload>(_event: DomainEvent<TPayload>): Promise<void> {
    throw new Error('AmqpEventBus.publish not implemented in Sprint 4 — Sprint 13 scope');
  }

  subscribe<TPayload>(_eventName: string, _handler: EventHandler<TPayload>): () => void {
    throw new Error('AmqpEventBus.subscribe not implemented in Sprint 4 — Sprint 13 scope');
  }
}

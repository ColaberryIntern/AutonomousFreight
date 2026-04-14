import { EVENT_SCHEMAS, type EventSchemaKey } from './schema';
import type { DomainEvent, EventBus, EventHandler } from './types';

export interface BusLogger {
  error(payload: Record<string, unknown>, msg: string): void;
}

const defaultLogger: BusLogger = {
  error: (payload, msg) => {
    console.error(`[bus] ${msg}`, payload);
  },
};

export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<EventHandler<unknown>>>();

  constructor(private readonly logger: BusLogger = defaultLogger) {}

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    this.validate(event);
    const handlers = this.subscribers.get(event.name);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        await handler(event as DomainEvent<unknown>);
      } catch (err) {
        this.logger.error({ err, eventName: event.name, traceId: event.traceId }, 'handler threw');
      }
    }
  }

  subscribe<TPayload>(eventName: string, handler: EventHandler<TPayload>): () => void {
    const typed = handler as EventHandler<unknown>;
    const set = this.subscribers.get(eventName) ?? new Set();
    set.add(typed);
    this.subscribers.set(eventName, set);
    return () => {
      set.delete(typed);
    };
  }

  private validate<TPayload>(event: DomainEvent<TPayload>): void {
    const key = `${event.name}@${event.version}` as EventSchemaKey;
    const schema = EVENT_SCHEMAS[key];
    if (!schema) return;
    schema.parse(event.payload);
  }
}

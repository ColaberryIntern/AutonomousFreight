export interface DomainEvent<TPayload = unknown> {
  name: string;
  version: number;
  payload: TPayload;
  occurredAt: string;
  traceId?: string;
}

export type EventHandler<TPayload = unknown> = (
  event: DomainEvent<TPayload>,
) => Promise<void> | void;

export interface EventBus {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(eventName: string, handler: EventHandler<TPayload>): () => void;
}

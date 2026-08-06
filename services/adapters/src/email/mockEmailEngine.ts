/** Deterministic in-memory Email engine for tests. Seed inbound, capture sent. */
import type { AdapterResult, OpMeta } from '../contract';
import { correlationId, ok } from '../contract';
import type { EmailEngine, InboundEmail, OutboundEmail, SendResult } from './emailAdapter';

function meta(operation: string, seed: string): OpMeta {
  return { adapter: 'email', engine: 'mock', operation, correlationId: correlationId('email', operation, seed), startedAt: '1970-01-01T00:00:00.000Z', durationMs: 0 };
}

export class MockEmailEngine implements EmailEngine {
  readonly kind = 'email' as const;
  readonly engine = 'mock';
  readonly sent: OutboundEmail[] = [];

  constructor(private inbound: InboundEmail[] = []) {}

  seed(emails: InboundEmail[]): void {
    this.inbound = emails;
  }

  async health() {
    return { state: 'up' as const, engine: this.engine };
  }

  async fetchInbound(seed: string): Promise<AdapterResult<InboundEmail[]>> {
    return ok([...this.inbound], meta('fetchInbound', seed));
  }

  async send(email: OutboundEmail, seed: string): Promise<AdapterResult<SendResult>> {
    this.sent.push(email);
    return ok({ providerMessageId: `MOCK-${this.sent.length}` }, meta('send', seed));
  }
}

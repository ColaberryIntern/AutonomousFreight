/**
 * Ingestion state stores. Interfaces first (contract), in-memory impls for
 * tests/dev. Production swaps in Postgres/Redis behind the same interface
 * without touching the pipeline (CLAUDE.md: stateless execution, state in a
 * store, not in memory across runs).
 */

export interface IdempotencyRecord {
  seen: boolean;
  rfqId?: string;
}

/**
 * Records which email hashes have already been ingested (dedup by email hash).
 *
 * ATOMICITY NOTE: the pipeline currently does check-then-act (has -> work ->
 * mark), which is correct under sequential replay but can let two CONCURRENT
 * ingests of the same email both pass `has`. The production implementation must
 * back `mark` with an atomic insert-if-absent (a Postgres UNIQUE constraint on
 * emailHash, or Redis SETNX) so concurrency collapses to one winner. The
 * in-memory store below is single-process and guards the row on `mark`.
 */
export interface IdempotencyStore {
  has(emailHash: string): Promise<IdempotencyRecord>;
  mark(emailHash: string, rfqId: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, string>();
  async has(emailHash: string): Promise<IdempotencyRecord> {
    const rfqId = this.map.get(emailHash);
    return rfqId ? { seen: true, rfqId } : { seen: false };
  }
  async mark(emailHash: string, rfqId: string): Promise<void> {
    if (!this.map.has(emailHash)) this.map.set(emailHash, rfqId);
  }
  get size(): number {
    return this.map.size;
  }
}

export interface DeadLetter {
  emailHash: string;
  from: string;
  subject: string;
  receivedAt: string;
  errors: string[];
}

/** Parse failures land here for review + replay, never silently dropped. */
export interface DeadLetterStore {
  add(entry: DeadLetter): Promise<void>;
  list(): Promise<DeadLetter[]>;
}

export class InMemoryDeadLetterStore implements DeadLetterStore {
  private readonly entries: DeadLetter[] = [];
  async add(entry: DeadLetter): Promise<void> {
    this.entries.push(entry);
  }
  async list(): Promise<DeadLetter[]> {
    return [...this.entries];
  }
}

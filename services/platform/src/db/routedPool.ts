import type { Pool, QueryResult, QueryResultRow } from 'pg';

export interface RoutedPoolDeps {
  primary: Pool;
  replicas?: Pool[];
}

export class RoutedPool {
  private cursor = 0;
  private readonly replicas: Pool[];

  constructor(private readonly deps: RoutedPoolDeps) {
    this.replicas = deps.replicas ?? [];
  }

  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.deps.primary.query<R>(text, values);
  }

  queryRead<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    if (this.replicas.length === 0) return this.deps.primary.query<R>(text, values);
    const idx = this.cursor % this.replicas.length;
    this.cursor = (this.cursor + 1) % Number.MAX_SAFE_INTEGER;
    const replica = this.replicas[idx];
    if (!replica) return this.deps.primary.query<R>(text, values);
    return replica.query<R>(text, values);
  }

  async queryReadOrPrimary<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    if (this.replicas.length === 0) return this.deps.primary.query<R>(text, values);
    try {
      return await this.queryRead<R>(text, values);
    } catch {
      return this.deps.primary.query<R>(text, values);
    }
  }
}

import type { Pool, QueryResult } from 'pg';
import { RoutedPool } from '../../../services/platform/src/db/routedPool';

function fakePool(label: string, throwError = false): Pool & { calls: number } {
  let calls = 0;
  const obj = {
    get calls(): number {
      return calls;
    },
    query: (_text: string, _values?: unknown[]): Promise<QueryResult> => {
      calls++;
      if (throwError) return Promise.reject(new Error(`${label} failed`));
      return Promise.resolve({
        rows: [{ src: label }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      } as unknown as QueryResult);
    },
  };
  return obj as unknown as Pool & { calls: number };
}

describe('RoutedPool', () => {
  it('query() always hits primary', async () => {
    const primary = fakePool('p');
    const replicas = [fakePool('r1'), fakePool('r2')];
    const r = new RoutedPool({ primary, replicas });
    await r.query('SELECT 1');
    await r.query('SELECT 1');
    expect((primary as { calls: number }).calls).toBe(2);
    expect((replicas[0] as { calls: number }).calls).toBe(0);
    expect((replicas[1] as { calls: number }).calls).toBe(0);
  });

  it('queryRead round-robins across replicas', async () => {
    const primary = fakePool('p');
    const r1 = fakePool('r1');
    const r2 = fakePool('r2');
    const r = new RoutedPool({ primary, replicas: [r1, r2] });
    await r.queryRead('SELECT 1');
    await r.queryRead('SELECT 1');
    await r.queryRead('SELECT 1');
    expect((r1 as { calls: number }).calls).toBe(2);
    expect((r2 as { calls: number }).calls).toBe(1);
    expect((primary as { calls: number }).calls).toBe(0);
  });

  it('queryRead falls back to primary when no replicas configured', async () => {
    const primary = fakePool('p');
    const r = new RoutedPool({ primary });
    await r.queryRead('SELECT 1');
    expect((primary as { calls: number }).calls).toBe(1);
  });

  it('queryReadOrPrimary retries on primary when replica errors', async () => {
    const primary = fakePool('p');
    const replica = fakePool('r1', true);
    const r = new RoutedPool({ primary, replicas: [replica] });
    const out = await r.queryReadOrPrimary('SELECT 1');
    expect(out.rows[0]).toEqual({ src: 'p' });
    expect((replica as { calls: number }).calls).toBe(1);
    expect((primary as { calls: number }).calls).toBe(1);
  });
});

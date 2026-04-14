import { escapeTsQuery, parseIntent } from '../../../services/carrier/src/domain/nlIntent';

describe('parseIntent', () => {
  it('extracts US state codes', () => {
    const r = parseIntent('active carriers in TX and IL');
    expect(r.stateCodes).toEqual(['IL', 'TX']);
  });

  it('extracts shipment statuses', () => {
    const r = parseIntent('shipments delivered or in transit');
    expect(r.statuses).toContain('delivered');
    expect(r.statuses).toContain('in_transit');
  });

  it('extracts "last N days" date range', () => {
    expect(parseIntent('shipments in last 14 days').dateRangeDays).toBe(14);
    expect(parseIntent('show last 999 days').dateRangeDays).toBe(365);
  });

  it('extracts "this week"', () => {
    expect(parseIntent('shipments this week').dateRangeDays).toBe(7);
  });

  it('returns no facets for plain text', () => {
    const r = parseIntent('cold storage carriers near Houston');
    expect(r.stateCodes).toEqual([]);
    expect(r.statuses).toEqual([]);
    expect(r.dateRangeDays).toBeUndefined();
  });
});

describe('escapeTsQuery', () => {
  it('strips non-alphanumeric and produces prefix-AND tsquery', () => {
    expect(escapeTsQuery('cold storage')).toBe('cold:* & storage:*');
  });

  it('drops dangerous characters that would break tsquery', () => {
    expect(escapeTsQuery("'; DROP TABLE users; --")).toBe('DROP:* & TABLE:* & users:*');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(escapeTsQuery('   ')).toBe('');
  });
});

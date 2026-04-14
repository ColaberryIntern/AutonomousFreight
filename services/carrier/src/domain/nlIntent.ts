export type ShipmentStatus = 'quoting' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';

export interface ParsedIntent {
  freeText: string;
  stateCodes: string[];
  statuses: ShipmentStatus[];
  dateRangeDays?: number;
}

const US_STATES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
]);

const STATUSES: ShipmentStatus[] = ['quoting', 'assigned', 'in_transit', 'delivered', 'cancelled'];

const DATE_RANGES: Array<{ pattern: RegExp; days: number }> = [
  { pattern: /\bthis week\b/i, days: 7 },
  { pattern: /\blast (\d+) days?\b/i, days: 0 },
  { pattern: /\blast week\b/i, days: 14 },
  { pattern: /\bthis month\b/i, days: 30 },
];

export function parseIntent(query: string): ParsedIntent {
  const tokens = query.split(/\s+/);
  const stateCodes = new Set<string>();
  for (const t of tokens) {
    const stripped = t.replace(/[^A-Za-z]/g, '');
    if (stripped.length === 2 && stripped === stripped.toUpperCase() && US_STATES.has(stripped)) {
      stateCodes.add(stripped);
    }
  }
  const statuses = new Set<ShipmentStatus>();
  for (const s of STATUSES) {
    if (new RegExp(`\\b${s.replace('_', '[ _]?')}\\b`, 'i').test(query)) statuses.add(s);
  }
  let dateRangeDays: number | undefined;
  const lastN = /\blast (\d+) days?\b/i.exec(query);
  if (lastN && lastN[1]) {
    dateRangeDays = Math.max(1, Math.min(365, Number(lastN[1])));
  } else {
    for (const range of DATE_RANGES) {
      if (range.days > 0 && range.pattern.test(query)) {
        dateRangeDays = range.days;
        break;
      }
    }
  }
  const result: ParsedIntent = {
    freeText: query.trim(),
    stateCodes: [...stateCodes].sort(),
    statuses: [...statuses].sort(),
  };
  if (dateRangeDays !== undefined) result.dateRangeDays = dateRangeDays;
  return result;
}

export function escapeTsQuery(q: string): string {
  return q
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`)
    .join(' & ');
}

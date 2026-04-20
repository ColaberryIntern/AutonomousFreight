export type UsageMetric = 'api_calls' | 'shipments_processed' | 'agent_runs';

export interface UsagePeriod {
  metric: UsageMetric;
  count: number;
  periodStart: string;
}

/**
 * In-memory usage counter for pay-as-you-go metering.
 * Stub implementation — production would persist to DB or Stripe metering.
 */
const counters = new Map<string, number>();

function key(userId: string, metric: UsageMetric): string {
  return `${userId}:${metric}`;
}

export function recordUsage(userId: string, metric: UsageMetric, quantity = 1): void {
  const k = key(userId, metric);
  counters.set(k, (counters.get(k) ?? 0) + quantity);
}

export function getUsage(userId: string): UsagePeriod[] {
  const periodStart = new Date(
    Date.now() - (Date.now() % (30 * 86_400_000)),
  ).toISOString();
  const metrics: UsageMetric[] = ['api_calls', 'shipments_processed', 'agent_runs'];
  return metrics.map((metric) => ({
    metric,
    count: counters.get(key(userId, metric)) ?? 0,
    periodStart,
  }));
}

export function resetUsageForTest(): void {
  counters.clear();
}

export interface ReconciliationInput {
  invoiceCount: number;
  settledCount: number;
  disputeCount: number;
  totalInvoicedUsd: number;
  totalSettledUsd: number;
  totalDisputedUsd: number;
}

export interface ReconciliationSummary {
  invoiceCount: number;
  settledCount: number;
  disputeCount: number;
  unmatchedCount: number;
  matchRate: number;
  totalInvoicedUsd: number;
  totalSettledUsd: number;
  totalDisputedUsd: number;
  netDiscrepancyUsd: number;
}

/**
 * Computes a reconciliation summary from invoice, settlement, and dispute counts.
 * Pure function — no side effects.
 */
export function computeReconciliation(input: ReconciliationInput): ReconciliationSummary {
  const unmatchedCount = Math.max(0, input.invoiceCount - input.settledCount);
  const matchRate =
    input.invoiceCount > 0
      ? Math.round((input.settledCount / input.invoiceCount) * 10_000) / 100
      : 100;
  const netDiscrepancyUsd =
    Math.round((input.totalInvoicedUsd - input.totalSettledUsd - input.totalDisputedUsd) * 100) /
    100;

  return {
    invoiceCount: input.invoiceCount,
    settledCount: input.settledCount,
    disputeCount: input.disputeCount,
    unmatchedCount,
    matchRate,
    totalInvoicedUsd: input.totalInvoicedUsd,
    totalSettledUsd: input.totalSettledUsd,
    totalDisputedUsd: input.totalDisputedUsd,
    netDiscrepancyUsd,
  };
}

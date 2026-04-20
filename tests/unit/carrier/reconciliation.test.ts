import { computeReconciliation } from '../../../services/carrier/src/domain/reconciliation';

describe('computeReconciliation', () => {
  it('returns 100% match rate when all invoices settled', () => {
    const result = computeReconciliation({
      invoiceCount: 10,
      settledCount: 10,
      disputeCount: 0,
      totalInvoicedUsd: 5000,
      totalSettledUsd: 5000,
      totalDisputedUsd: 0,
    });
    expect(result.matchRate).toBe(100);
    expect(result.unmatchedCount).toBe(0);
    expect(result.netDiscrepancyUsd).toBe(0);
  });

  it('calculates unmatched count and match rate', () => {
    const result = computeReconciliation({
      invoiceCount: 20,
      settledCount: 15,
      disputeCount: 2,
      totalInvoicedUsd: 10000,
      totalSettledUsd: 7500,
      totalDisputedUsd: 500,
    });
    expect(result.unmatchedCount).toBe(5);
    expect(result.matchRate).toBe(75);
    expect(result.netDiscrepancyUsd).toBe(2000);
  });

  it('returns 100% match rate when no invoices exist', () => {
    const result = computeReconciliation({
      invoiceCount: 0,
      settledCount: 0,
      disputeCount: 0,
      totalInvoicedUsd: 0,
      totalSettledUsd: 0,
      totalDisputedUsd: 0,
    });
    expect(result.matchRate).toBe(100);
    expect(result.unmatchedCount).toBe(0);
  });

  it('handles negative discrepancy (overpayment)', () => {
    const result = computeReconciliation({
      invoiceCount: 5,
      settledCount: 5,
      disputeCount: 0,
      totalInvoicedUsd: 1000,
      totalSettledUsd: 1200,
      totalDisputedUsd: 0,
    });
    expect(result.netDiscrepancyUsd).toBe(-200);
  });
});

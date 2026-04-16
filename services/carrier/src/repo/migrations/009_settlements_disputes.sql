-- Directive 230: Payment Match + Settlement + Dispute.
-- Idempotent.

ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN (
    'quoting', 'assigned', 'dispatched', 'in_transit', 'delivered',
    'doc_verified', 'rate_audited', 'rate_audit_exception', 'invoiced',
    'settled', 'cancelled'
  ));

-- Add matched/match_failed to invoices
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('issued', 'accepted', 'paid', 'matched', 'match_failed', 'disputed', 'settled'));

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL UNIQUE REFERENCES invoices (id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES carriers (id),
  amount_usd NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL UNIQUE REFERENCES invoices (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  discrepancy_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'credited')),
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements (status);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);

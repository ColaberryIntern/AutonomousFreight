-- Directive 220: Invoice-to-Cash lifecycle.
-- Idempotent.

-- Constraint managed by 009_settlements_disputes.sql (the latest migration).
-- Removed from here to avoid DROP+recreate with a subset on re-run.

-- Invoice number sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL UNIQUE REFERENCES shipments (id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  carrier_cost_usd NUMERIC(10,2) NOT NULL,
  margin_usd NUMERIC(10,2) NOT NULL,
  margin_pct NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'accepted', 'paid', 'disputed', 'settled')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_shipment ON invoices (shipment_id);

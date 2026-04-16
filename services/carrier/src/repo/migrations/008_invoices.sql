-- Directive 220: Invoice-to-Cash lifecycle.
-- Idempotent.

-- Expand shipment status
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN (
    'quoting', 'assigned', 'dispatched', 'in_transit', 'delivered',
    'doc_verified', 'rate_audited', 'rate_audit_exception', 'invoiced', 'cancelled'
  ));

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

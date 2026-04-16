-- Directives 210-212: shipment lifecycle V-3.
-- Adds dispatched/in_transit/doc_verified statuses + milestone + document tables.
-- Idempotent.

-- Expand shipment status CHECK to include new states
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('quoting', 'assigned', 'dispatched', 'in_transit', 'delivered', 'doc_verified', 'cancelled'));

-- Shipment milestones (directive 211)
CREATE TABLE IF NOT EXISTS shipment_milestones (
  id BIGSERIAL PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  milestone TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (shipment_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_milestones_shipment ON shipment_milestones (shipment_id);

-- Shipment documents (directive 212)
CREATE TABLE IF NOT EXISTS shipment_documents (
  id BIGSERIAL PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('bol', 'pod', 'invoice')),
  raw_text TEXT NOT NULL,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_shipment ON shipment_documents (shipment_id);

-- Track when a shipment was assigned (for milestone timing)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS assigned_carrier_id UUID REFERENCES carriers (id);

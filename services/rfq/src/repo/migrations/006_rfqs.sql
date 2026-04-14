-- Directive 200 — RFQ → Quote pipeline.
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  distance_miles INTEGER NOT NULL CHECK (distance_miles > 0 AND distance_miles <= 5000),
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('dry_van','reefer','flatbed')),
  pickup_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','parsed','priced','sent','won','lost','exception')),
  price_offered_usd NUMERIC(10,2),
  confidence NUMERIC(3,2),
  reason TEXT,
  shipment_id UUID REFERENCES shipments (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs (status);
CREATE INDEX IF NOT EXISTS idx_rfqs_created ON rfqs (created_at DESC);

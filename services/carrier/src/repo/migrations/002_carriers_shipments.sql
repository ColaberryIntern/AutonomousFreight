-- Directive 030 — carriers, shipments, carrier_bids.
-- Idempotent; safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rating NUMERIC(3, 2) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  distance_miles INTEGER NOT NULL CHECK (distance_miles >= 0),
  status TEXT NOT NULL DEFAULT 'quoting'
    CHECK (status IN ('quoting', 'assigned', 'in_transit', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carrier_bids (
  shipment_id UUID NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES carriers (id) ON DELETE CASCADE,
  cost_usd NUMERIC(10, 2) NOT NULL CHECK (cost_usd >= 0),
  pickup_distance_miles INTEGER NOT NULL CHECK (pickup_distance_miles >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shipment_id, carrier_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_bids_shipment ON carrier_bids (shipment_id);

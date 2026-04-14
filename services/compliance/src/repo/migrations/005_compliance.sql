-- Directive 070 — compliance artifacts + carrier compliance snapshot.
-- Idempotent.

CREATE TABLE IF NOT EXISTS compliance_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('broker_authority', 'surety_bond', 'state_license')),
  reference TEXT NOT NULL,
  jurisdiction TEXT,
  issued_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_compliance_expires ON compliance_artifacts (expires_at);

CREATE TABLE IF NOT EXISTS carrier_compliance (
  carrier_id UUID PRIMARY KEY REFERENCES carriers (id) ON DELETE CASCADE,
  dot_number TEXT,
  operating_status TEXT NOT NULL CHECK (operating_status IN ('active', 'out_of_service', 'unknown')),
  safety_rating TEXT NOT NULL CHECK (safety_rating IN ('satisfactory', 'conditional', 'unsatisfactory', 'unrated')),
  insurance_on_file BOOLEAN NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

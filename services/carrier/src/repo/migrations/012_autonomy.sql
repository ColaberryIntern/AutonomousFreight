-- Directive 240 — autonomy levels + confidence samples (learning loop).
-- Persists per-operation graduation state for the Autonomy Console.
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS autonomy_levels (
  operation TEXT PRIMARY KEY
    CHECK (operation IN ('quoting', 'dispatch', 'invoicing')),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  notes TEXT,
  updated_by_user_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS autonomy_confidence_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL
    CHECK (operation IN ('quoting', 'dispatch', 'invoicing')),
  target_id UUID,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('success', 'failure', 'reversed', 'escalated')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_samples_operation_time
  ON autonomy_confidence_samples (operation, occurred_at DESC);

-- Seed: every operation starts at L1 (human-in-the-loop) per V5 §6.
INSERT INTO autonomy_levels (operation, level, notes)
VALUES
  ('quoting',   1, 'Initial — agent proposes; human approves every quote.'),
  ('dispatch',  1, 'Initial — agent proposes; human approves every assignment.'),
  ('invoicing', 1, 'Initial — agent drafts; human approves every invoice.')
ON CONFLICT (operation) DO NOTHING;

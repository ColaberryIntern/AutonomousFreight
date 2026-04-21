-- Performance indexes for hot query paths.
-- Idempotent.

-- Shipments by status (agents, dashboard, queue — queried every 5s)
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments (status);

-- Shipments by assigned carrier (reconciliation, carrier history)
CREATE INDEX IF NOT EXISTS idx_shipments_assigned_carrier ON shipments (assigned_carrier_id);

-- Audit log by timestamp (security trends, KPIs, dashboard 24h count)
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_log (occurred_at);

-- Carrier bids by carrier (compliance lookups, bid validation)
CREATE INDEX IF NOT EXISTS idx_carrier_bids_carrier ON carrier_bids (carrier_id);

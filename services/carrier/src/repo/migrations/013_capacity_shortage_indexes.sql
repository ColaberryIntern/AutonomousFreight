-- Directive 210 (perf) — capacity shortage hot path indexes.
-- Supports the procurement-agent N+1 fix and the capacity-shortage endpoint.
-- Idempotent.

-- Composite supporting:
--   SELECT ... FROM shipments
--   WHERE status = 'quoting'
--     AND (last_agent_check_at IS NULL
--          OR last_agent_check_at < NOW() - INTERVAL 'X seconds')
-- The leading status column makes this a covering match for the agent's
-- ticked filter; the trailing last_agent_check_at lets PG pick the right
-- rows by index range scan instead of seq-scanning all quoting shipments.
CREATE INDEX IF NOT EXISTS idx_shipments_status_last_check
  ON shipments (status, last_agent_check_at);

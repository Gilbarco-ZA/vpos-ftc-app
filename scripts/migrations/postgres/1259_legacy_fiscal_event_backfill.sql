-- Phase 3B: support bounded, idempotent migration of legacy transaction
-- fiscalization responses into canonical fiscalization_events rows.
--
-- The application backfill owns payload normalization, redaction, event
-- creation/linking, and replacement of the transaction column with a compact
-- compatibility summary. This migration adds only the lookup indexes required
-- to keep those operations bounded and restart-safe.

CREATE INDEX IF NOT EXISTS idx_fisc_events_station_txn_payload_hash
  ON fiscalization_events (station_id, transaction_id, payload_hash)
  WHERE payload_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_fiscal_response_backfill
  ON transactions (station_id, created_at, id)
  WHERE fiscalization_response IS NOT NULL;

COMMENT ON INDEX idx_fisc_events_station_txn_payload_hash IS
  'Supports idempotent Phase 3B matching of legacy transaction responses to existing canonical fiscalization events.';
COMMENT ON INDEX idx_transactions_fiscal_response_backfill IS
  'Supports bounded Phase 3B scanning of transactions that still carry a fiscalization compatibility or legacy response value.';

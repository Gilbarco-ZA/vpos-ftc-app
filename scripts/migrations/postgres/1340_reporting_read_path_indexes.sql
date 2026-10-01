-- Speed up report date-range reads and latest receipt lookup.
--
-- Reports filter transactions by station/date and resolve the latest receipt for
-- each returned transaction. These composite indexes avoid repeated scans and
-- per-row sorts on constrained controllers.

CREATE INDEX IF NOT EXISTS idx_transactions_station_date_active
  ON transactions (station_id, transaction_date_time DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_station_transaction_generated
  ON receipts (station_id, transaction_id, generated_at DESC);

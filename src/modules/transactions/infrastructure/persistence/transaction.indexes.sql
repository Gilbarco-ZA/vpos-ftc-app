-- Promoted to scripts/migrations/postgres/052_transactions_read_path_indexes.sql.
-- Keep this file only as module-local documentation of the active indexes.

CREATE INDEX IF NOT EXISTS idx_transactions_station_status_date_active
  ON transactions (station_id, status, transaction_date_time DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_station_customer_date_active
  ON transactions (station_id, customer_id, transaction_date_time DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_station_fiscalized_at
  ON transactions (station_id, fiscalized_at DESC)
  WHERE fiscalized_at IS NOT NULL;

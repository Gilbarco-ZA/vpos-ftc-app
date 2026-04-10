-- Promoted to scripts/migrations/postgres/054_fiscal_inbox_read_path_indexes.sql.
-- Keep this file only as module-local documentation of the active indexes.

CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_station_status_next_attempt
  ON fiscal_inbox (station_id, status, next_attempt_at, id DESC);

CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_station_request_lookup
  ON fiscal_inbox (station_id, request_id, id DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_station_topic_received
  ON fiscal_inbox (station_id, topic, received_at DESC);

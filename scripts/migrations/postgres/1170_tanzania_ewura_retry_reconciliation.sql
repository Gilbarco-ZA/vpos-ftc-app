-- Tanzania EWURA retry/reconciliation state.
-- EWURA failures are not removed from the DB-backed queues until the EFPP
-- endpoint confirms success. This mirrors the legacy vpos-fiscal-tz file queue
-- behaviour where failed EWURA posts remain queued for later processing.

ALTER TABLE ewura_transactions
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE ewura_reports
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE ewura_registration
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ewura_transactions_retry_ready
  ON ewura_transactions(station_id, status, next_attempt_at, retry_count);

CREATE INDEX IF NOT EXISTS idx_ewura_reports_retry_ready
  ON ewura_reports(station_id, status, next_attempt_at, retry_count);

CREATE INDEX IF NOT EXISTS idx_ewura_registration_retry_ready
  ON ewura_registration(station_id, status, next_attempt_at, retry_count);

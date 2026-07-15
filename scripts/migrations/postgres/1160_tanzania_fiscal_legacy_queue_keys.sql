-- Tanzania fiscal legacy queue idempotency anchors.
-- vpos-fiscal-tz queue files store either payload objects or filesystem paths;
-- FTC imports them into DB queues with a stable source key so repeated imports do
-- not duplicate recovered pending/retry work.

ALTER TABLE transaction_queue
  ADD COLUMN IF NOT EXISTS legacy_source_key TEXT;

ALTER TABLE report_queue
  ADD COLUMN IF NOT EXISTS legacy_source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_transaction_queue_station_legacy_source
  ON transaction_queue(station_id, legacy_source_key)
  WHERE legacy_source_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_report_queue_station_legacy_source
  ON report_queue(station_id, legacy_source_key)
  WHERE legacy_source_key IS NOT NULL;

ALTER TABLE ewura_transactions
  ADD COLUMN IF NOT EXISTS legacy_source_key TEXT;

ALTER TABLE ewura_reports
  ADD COLUMN IF NOT EXISTS legacy_source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ewura_transactions_station_legacy_source
  ON ewura_transactions(station_id, legacy_source_key)
  WHERE legacy_source_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ewura_reports_station_legacy_source
  ON ewura_reports(station_id, legacy_source_key)
  WHERE legacy_source_key IS NOT NULL;

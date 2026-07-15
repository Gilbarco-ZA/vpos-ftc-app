-- Tanzania fiscal/EWURA DB-backed queue anchors.
-- vpos-fiscal-tz historically used filesystem JSON queues; FTC stores every
-- outbound Tanzania fiscal/EWURA payload in Postgres before sending.

ALTER TABLE ewura_transactions
  ADD COLUMN IF NOT EXISTS source_queue_id UUID;

ALTER TABLE ewura_reports
  ADD COLUMN IF NOT EXISTS source_queue_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ewura_transactions_station_transaction
  ON ewura_transactions(station_id, transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ewura_transactions_station_source_queue
  ON ewura_transactions(station_id, source_queue_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ewura_reports_station_source_queue
  ON ewura_reports(station_id, source_queue_id);

CREATE INDEX IF NOT EXISTS idx_ewura_transactions_status
  ON ewura_transactions(station_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_ewura_reports_status
  ON ewura_reports(station_id, status, updated_at);

CREATE TABLE IF NOT EXISTS tanzania_fiscal_counters (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  counter_key TEXT NOT NULL,
  counter_value BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, counter_key)
);

DROP TRIGGER IF EXISTS update_tanzania_fiscal_counters_updated_at ON tanzania_fiscal_counters;
CREATE TRIGGER update_tanzania_fiscal_counters_updated_at BEFORE UPDATE ON tanzania_fiscal_counters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

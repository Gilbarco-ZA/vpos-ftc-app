-- Receipts page reads directly from receipts. This index supports the
-- station-scoped newest-first list without sorting the entire receipt history.

CREATE INDEX IF NOT EXISTS idx_receipts_station_generated_desc
  ON receipts (station_id, generated_at DESC);

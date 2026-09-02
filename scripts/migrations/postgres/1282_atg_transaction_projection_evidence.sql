-- Retain a bounded, normalized ATG evidence window for transaction-time
-- regulatory projections. tank_atg_snapshots remains the current-state table;
-- cloud services continue to own long-term/raw ATG history.

CREATE TABLE IF NOT EXISTS tank_atg_capture_evidence (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  tank_id UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  tg_id VARCHAR(2) NOT NULL,
  doms_tank_id VARCHAR(2),
  captured_at TIMESTAMPTZ NOT NULL,
  controller_updated_at TIMESTAMPTZ,
  volume_litres NUMERIC(14, 3),
  source_payload_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tank_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_tank_atg_capture_evidence_station_capture
  ON tank_atg_capture_evidence(station_id, captured_at DESC, tank_id);

-- Preserve the currently available row during upgrade. It is eligible for a
-- transaction projection only when its capture time is not newer than the
-- transaction; the migration never rewrites or fabricates an older timestamp.
INSERT INTO tank_atg_capture_evidence (
  station_id,
  tank_id,
  product_id,
  tg_id,
  doms_tank_id,
  captured_at,
  controller_updated_at,
  volume_litres,
  source_payload_hash
)
SELECT station_id,
       tank_id,
       product_id,
       tg_id,
       doms_tank_id,
       captured_at,
       controller_updated_at,
       volume_litres,
       source_payload_hash
  FROM tank_atg_snapshots
ON CONFLICT (tank_id, captured_at) DO NOTHING;

COMMENT ON TABLE tank_atg_capture_evidence IS
  'Bounded normalized ATG capture evidence used to reconstruct transaction-time regulatory tank balances. Raw and long-term ATG history remains cloud-owned.';

CREATE TABLE IF NOT EXISTS forecourt_doms_maintenance_execution_claims (
  permit_id TEXT PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  command_digest TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'succeeded', 'failed')),
  response JSONB,
  error_text TEXT,
  claimed_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doms_maintenance_execution_claims_station_time
  ON forecourt_doms_maintenance_execution_claims (station_id, claimed_at DESC);

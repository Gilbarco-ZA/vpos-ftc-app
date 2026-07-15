CREATE TABLE IF NOT EXISTS forecourt_jpl_dynamic_tank_data_audit (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  tank_id VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'requested',
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  requested_by VARCHAR(128),
  requested_role VARCHAR(64),
  reason TEXT,
  source VARCHAR(64),
  validation_warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_json JSONB,
  error_text TEXT,
  source_hash VARCHAR(128) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_dynamic_tank_data_station_status
  ON forecourt_jpl_dynamic_tank_data_audit(station_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_dynamic_tank_data_station_tank
  ON forecourt_jpl_dynamic_tank_data_audit(station_id, tank_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_dynamic_tank_data_severity
  ON forecourt_jpl_dynamic_tank_data_audit(station_id, severity, updated_at DESC);

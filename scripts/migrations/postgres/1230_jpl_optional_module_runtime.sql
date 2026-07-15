CREATE TABLE IF NOT EXISTS forecourt_jpl_optional_device_snapshots (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  device_family VARCHAR(32) NOT NULL,
  device_id VARCHAR(16) NOT NULL,
  source_message VARCHAR(64) NOT NULL,
  source_sub_code VARCHAR(8),
  main_state VARCHAR(64),
  state_code VARCHAR(16),
  operational_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  online BOOLEAN,
  error_active BOOLEAN,
  alarm_active BOOLEAN,
  lock_id VARCHAR(16),
  protocol_id VARCHAR(32),
  device_label TEXT,
  status_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  alarms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash VARCHAR(128) NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, device_family, device_id)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_optional_snapshots_station_family
  ON forecourt_jpl_optional_device_snapshots(station_id, device_family, severity, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_optional_snapshots_status
  ON forecourt_jpl_optional_device_snapshots(station_id, operational_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS forecourt_jpl_optional_device_errors (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  device_family VARCHAR(32) NOT NULL,
  device_id VARCHAR(16) NOT NULL,
  source_message VARCHAR(64) NOT NULL,
  source_sub_code VARCHAR(8),
  error_code VARCHAR(64),
  error_name TEXT,
  error_text TEXT,
  error_date_and_time VARCHAR(32),
  protocol_id VARCHAR(32),
  severity VARCHAR(16) NOT NULL DEFAULT 'error',
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash VARCHAR(128) NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, device_family, device_id, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_optional_errors_station_status
  ON forecourt_jpl_optional_device_errors(station_id, status, severity, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_optional_errors_device
  ON forecourt_jpl_optional_device_errors(station_id, device_family, device_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS forecourt_jpl_vending_totals (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  vm_id VARCHAR(16) NOT NULL,
  vm_total_type VARCHAR(16),
  vm_total_type_label VARCHAR(64),
  grand_count_total VARCHAR(32),
  grand_money_total VARCHAR(32),
  totals_info_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash VARCHAR(128) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, vm_id, vm_total_type, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_vending_totals_station_vm
  ON forecourt_jpl_vending_totals(station_id, vm_id, updated_at DESC);

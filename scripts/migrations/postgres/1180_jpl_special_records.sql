CREATE TABLE IF NOT EXISTS forecourt_jpl_service_messages (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  fc_service_msg_seq_no VARCHAR(8) NOT NULL,
  source_hash VARCHAR(64) NOT NULL,
  message_text TEXT,
  payload_json JSONB,
  status VARCHAR(24) NOT NULL DEFAULT 'collected' CHECK (status IN ('collected', 'clear_requested', 'cleared', 'failed')),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clear_attempted_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, fc_service_msg_seq_no, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_service_messages_station_status
  ON forecourt_jpl_service_messages(station_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_service_messages_station_collected
  ON forecourt_jpl_service_messages(station_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS forecourt_jpl_back_office_records (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  bor_seq_no VARCHAR(8) NOT NULL,
  source_hash VARCHAR(64) NOT NULL,
  bor_format_id VARCHAR(8),
  sub_code VARCHAR(8) NOT NULL,
  bor_length INTEGER,
  bor_data TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'collected' CHECK (status IN ('collected', 'clear_requested', 'cleared', 'failed')),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clear_attempted_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, bor_seq_no, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_bor_station_status
  ON forecourt_jpl_back_office_records(station_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_bor_station_collected
  ON forecourt_jpl_back_office_records(station_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_bor_station_format
  ON forecourt_jpl_back_office_records(station_id, bor_format_id, collected_at DESC);

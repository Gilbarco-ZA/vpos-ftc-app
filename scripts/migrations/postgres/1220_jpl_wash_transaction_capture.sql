CREATE TABLE IF NOT EXISTS forecourt_jpl_wash_transactions (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  wp_id VARCHAR(8) NOT NULL,
  wp_trans_seq_no VARCHAR(16) NOT NULL,
  source_hash VARCHAR(128) NOT NULL,
  pos_id VARCHAR(8),
  sm_id VARCHAR(8),
  trans_lock_id VARCHAR(16),
  money VARCHAR(32),
  wash_program_no VARCHAR(16),
  fc_wash_id VARCHAR(16),
  auth_id VARCHAR(64),
  start_date VARCHAR(16),
  start_time VARCHAR(16),
  finish_date VARCHAR(16),
  finish_time VARCHAR(16),
  termination_status_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  trans_error_code VARCHAR(32),
  wash_options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  trans_return_data_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  clear_request_json JSONB,
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending_clear',
  clear_status VARCHAR(32) NOT NULL DEFAULT 'pending_clear',
  clear_attempts INTEGER NOT NULL DEFAULT 0,
  clear_attempted_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  last_error TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, wp_id, wp_trans_seq_no, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_wash_transactions_station_status
  ON forecourt_jpl_wash_transactions(station_id, clear_status, review_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_wash_transactions_wp_seq
  ON forecourt_jpl_wash_transactions(station_id, wp_id, wp_trans_seq_no);

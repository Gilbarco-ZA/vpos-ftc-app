CREATE TABLE IF NOT EXISTS forecourt_jpl_transaction_checkpoints (
  station_id UUID NOT NULL,
  source_mode VARCHAR(16) NOT NULL,
  fp_id INTEGER NOT NULL,
  trans_seq_no INTEGER NOT NULL,
  lifecycle_stage VARCHAR(32) NOT NULL DEFAULT 'discovered',
  lock_id VARCHAR(100),
  owner_pos_id VARCHAR(10),
  blocked_by_foreign_pos BOOLEAN NOT NULL DEFAULT FALSE,
  read_attempts INTEGER NOT NULL DEFAULT 0,
  clear_attempts INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  read_payload_json JSONB,
  clear_payload_json JSONB,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, source_mode, fp_id, trans_seq_no)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_tx_checkpoints_station_stage
  ON forecourt_jpl_transaction_checkpoints(station_id, lifecycle_stage, updated_at);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_tx_checkpoints_station_blocked
  ON forecourt_jpl_transaction_checkpoints(station_id, blocked_by_foreign_pos, updated_at);

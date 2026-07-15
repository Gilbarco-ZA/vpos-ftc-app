CREATE TABLE IF NOT EXISTS forecourt_jpl_transaction_recovery_runs (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL,
  requested_by UUID,
  trigger_source VARCHAR(48) NOT NULL DEFAULT 'manual_admin',
  status VARCHAR(24) NOT NULL DEFAULT 'started',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  rows_scanned INTEGER NOT NULL DEFAULT 0,
  retries_attempted INTEGER NOT NULL DEFAULT 0,
  clear_success_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_tx_recovery_runs_station_started
  ON forecourt_jpl_transaction_recovery_runs(station_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_tx_checkpoints_station_recoverable
  ON forecourt_jpl_transaction_checkpoints(station_id, lifecycle_stage, blocked_by_foreign_pos, updated_at);

CREATE TABLE IF NOT EXISTS forecourt_jpl_pos_sessions (
  station_id TEXT NOT NULL,
  pos_id VARCHAR(2) NOT NULL,
  owner_id TEXT NOT NULL,
  process_id INTEGER,
  host_name TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  PRIMARY KEY (station_id, pos_id)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_pos_sessions_expires_at
  ON forecourt_jpl_pos_sessions (expires_at)
  WHERE released_at IS NULL;

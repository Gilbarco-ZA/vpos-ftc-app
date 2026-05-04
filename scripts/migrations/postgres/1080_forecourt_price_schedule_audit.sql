ALTER TABLE forecourt_pending_price_sets
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted_local';

ALTER TABLE forecourt_pending_price_sets
  ADD COLUMN IF NOT EXISTS last_event_type TEXT;

ALTER TABLE forecourt_pending_price_sets
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;

UPDATE forecourt_pending_price_sets
   SET status = CASE
                  WHEN is_confirmed_on_doms = TRUE THEN 'confirmed_on_doms'
                  ELSE 'submitted_local'
                END,
       last_event_type = COALESCE(last_event_type, CASE
         WHEN is_confirmed_on_doms = TRUE THEN 'confirmed_on_doms'
         ELSE 'submitted_local'
       END),
       last_event_at = COALESCE(last_event_at, updated_at, created_at)
 WHERE status IS NULL
    OR last_event_type IS NULL
    OR last_event_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_forecourt_pending_price_sets_station_status
  ON forecourt_pending_price_sets(station_id, status, activation_at ASC);

CREATE TABLE IF NOT EXISTS forecourt_price_schedule_events (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  price_set_id INTEGER NOT NULL,
  activation_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',
  submitted_by TEXT,
  doms_confirmation_status TEXT,
  payload_sha256 TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecourt_price_schedule_events_station_activation
  ON forecourt_price_schedule_events(station_id, activation_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_price_schedule_events_station_event
  ON forecourt_price_schedule_events(station_id, event_type, created_at DESC);

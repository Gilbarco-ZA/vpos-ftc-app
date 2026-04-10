CREATE TABLE IF NOT EXISTS forecourt_pending_price_sets (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  price_set_id INTEGER NOT NULL,
  activation_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',
  is_confirmed_on_doms BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, price_set_id, activation_at)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_pending_price_sets_station_activation
  ON forecourt_pending_price_sets(station_id, activation_at ASC);

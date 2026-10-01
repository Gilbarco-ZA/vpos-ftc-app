-- Station-level opt-in for cloud fuel price change checks.
-- The check runs on the existing ATG polling cadence; it does not own a timer.

ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS fuel_price_polling_enabled BOOLEAN NOT NULL DEFAULT FALSE;

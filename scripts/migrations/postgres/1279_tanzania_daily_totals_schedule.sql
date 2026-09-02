-- Station-local scheduled send time for Tanzania daily totals.
-- The worker may poll more frequently, but creates the previous closed
-- business-day submission only after this local wall-clock time is reached.

ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS tanzania_daily_totals_send_time TIME WITHOUT TIME ZONE
  NOT NULL DEFAULT TIME '00:00:00';

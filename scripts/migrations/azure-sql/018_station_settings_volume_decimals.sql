-- 018_station_settings_volume_decimals.sql
-- Adds configurable volume decimal places per station.
-- SA = 1, KE = 2, TZ = 3, etc. Default is 2.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'station_settings' AND COLUMN_NAME = 'volume_decimals'
)
BEGIN
  ALTER TABLE station_settings
    ADD volume_decimals INT NOT NULL DEFAULT 2;

  ALTER TABLE station_settings
    ADD CONSTRAINT ck_volume_decimals CHECK (volume_decimals >= 0 AND volume_decimals <= 3);
END

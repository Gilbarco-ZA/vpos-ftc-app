-- 023_station_settings_auto_print_receipts.sql
-- Adds auto print receipts flag (default off).

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'station_settings' AND COLUMN_NAME = 'auto_print_receipts'
)
BEGIN
  ALTER TABLE station_settings
    ADD auto_print_receipts BIT NOT NULL DEFAULT 0;
END

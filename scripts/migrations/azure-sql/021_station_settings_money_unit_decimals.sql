-- 021_station_settings_money_unit_decimals.sql
-- Adds configurable decimal places for money and unit price (default 2, range 0-3).

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'station_settings' AND COLUMN_NAME = 'money_decimals'
)
BEGIN
  ALTER TABLE station_settings
    ADD money_decimals INT NOT NULL DEFAULT 2;
END

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_money_decimals')
BEGIN
  ALTER TABLE station_settings
    ADD CONSTRAINT ck_money_decimals CHECK (money_decimals >= 0 AND money_decimals <= 3);
END

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'station_settings' AND COLUMN_NAME = 'unit_price_decimals'
)
BEGIN
  ALTER TABLE station_settings
    ADD unit_price_decimals INT NOT NULL DEFAULT 2;
END

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_unit_price_decimals')
BEGIN
  ALTER TABLE station_settings
    ADD CONSTRAINT ck_unit_price_decimals CHECK (unit_price_decimals >= 0 AND unit_price_decimals <= 3);
END

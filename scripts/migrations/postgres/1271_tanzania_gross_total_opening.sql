-- Opening cumulative gross total for replacement Tanzania fiscal machines.
-- The daily total worker adds fiscal turnover recorded by this installation.

ALTER TABLE station_settings
    ADD COLUMN IF NOT EXISTS tanzania_gross_total_opening NUMERIC(20, 2) NOT NULL DEFAULT 0;

ALTER TABLE station_settings
    DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_gross_total_opening;

ALTER TABLE station_settings
    ADD CONSTRAINT ck_station_settings_tanzania_gross_total_opening
    CHECK (tanzania_gross_total_opening >= 0);

-- Optional administrator-owned Tanzania device identity override.
-- When set it takes precedence over the deviceId returned by site registration.

ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS tanzania_device_id_override VARCHAR(191);

ALTER TABLE station_settings
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_device_id_override;

ALTER TABLE station_settings
  ADD CONSTRAINT ck_station_settings_tanzania_device_id_override
  CHECK (
    tanzania_device_id_override IS NULL
    OR (
      BTRIM(tanzania_device_id_override) <> ''
      AND CHAR_LENGTH(tanzania_device_id_override) <= 191
    )
  );

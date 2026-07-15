ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS fiscalization_transport VARCHAR(20) NOT NULL DEFAULT 'proxy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_station_settings_fiscalization_transport'
       AND conrelid = 'station_settings'::regclass
  ) THEN
    ALTER TABLE station_settings
      ADD CONSTRAINT ck_station_settings_fiscalization_transport
      CHECK (fiscalization_transport IN ('proxy', 'local_tz'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_station_settings_fiscalization_transport
  ON station_settings(station_id, fiscalization_transport);

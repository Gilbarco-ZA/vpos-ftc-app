-- Persistent ATG polling configuration and historical tank-gauge snapshots.

ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS atg_polling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS atg_polling_interval_seconds INTEGER NOT NULL DEFAULT 600;

ALTER TABLE tanks
  ADD COLUMN IF NOT EXISTS live_tc_volume_litres NUMERIC(14, 3),
  ADD COLUMN IF NOT EXISTS live_temperature_c NUMERIC(10, 3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_station_settings_atg_polling_interval'
       AND conrelid = to_regclass(current_schema() || '.station_settings')
  ) THEN
    ALTER TABLE station_settings
      ADD CONSTRAINT ck_station_settings_atg_polling_interval
      CHECK (atg_polling_interval_seconds BETWEEN 60 AND 86400);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tank_atg_readings (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  tank_id UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  tg_id VARCHAR(2) NOT NULL,
  doms_tank_id VARCHAR(2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  controller_updated_at TIMESTAMPTZ,

  -- Station-owned descriptive snapshot requested by the tank-level contract.
  product_name TEXT,
  tank_name TEXT,
  capacity_litres NUMERIC(14, 3),
  temperature_c NUMERIC(10, 3),
  tc_volume_litres NUMERIC(14, 3),
  volume_litres NUMERIC(14, 3),

  -- Normalized DOMS TgData fields.
  product_level NUMERIC(14, 3),
  water_level NUMERIC(14, 3),
  total_observed_volume_litres NUMERIC(14, 3),
  water_volume_litres NUMERIC(14, 3),
  gross_observed_volume_litres NUMERIC(14, 3),
  gross_standard_volume_litres NUMERIC(14, 3),
  available_room_litres NUMERIC(14, 3),
  max_safe_fill_capacity_litres NUMERIC(14, 3),
  shell_capacity_litres NUMERIC(14, 3),
  product_mass NUMERIC(16, 4),
  product_density NUMERIC(16, 6),
  product_tc_density NUMERIC(16, 6),
  density_probe_temperature_c NUMERIC(10, 3),
  sludge_level NUMERIC(14, 3),
  oil_separator_oil_thickness NUMERIC(14, 3),
  oil_separator_oil_volume NUMERIC(14, 3),
  temp_sensor_1_c NUMERIC(10, 3),
  temp_sensor_2_c NUMERIC(10, 3),
  temp_sensor_3_c NUMERIC(10, 3),
  pressure NUMERIC(16, 4),
  adjusted_volume_litres NUMERIC(14, 3),
  adjusted_tc_volume_litres NUMERIC(14, 3),
  delivered_volume_litres NUMERIC(14, 3),
  delivered_tc_volume_litres NUMERIC(14, 3),
  delivered_mass NUMERIC(16, 4),
  delivered_quantity NUMERIC(16, 4),
  tg_product_code TEXT,
  tank_group_id TEXT,
  tank_gauge_type TEXT,
  tank_inflow_control_mode TEXT,
  source_payload_hash VARCHAR(64),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tank_atg_readings_station_recorded
  ON tank_atg_readings(station_id, recorded_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_tank_atg_readings_tank_recorded
  ON tank_atg_readings(tank_id, recorded_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_tank_atg_readings_tg_recorded
  ON tank_atg_readings(station_id, tg_id, recorded_at DESC, id);

COMMENT ON TABLE tank_atg_readings IS
  'Historical normalized ATG/TgData snapshots collected by the configurable GET_ALL_TG_DATA worker.';

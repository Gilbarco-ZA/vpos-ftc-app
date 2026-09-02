-- PSS topology identity must include PhysicalAddress.
-- Multiple fuelling points may share the same PSSPortNo + DeviceSubAddress pair
-- while being differentiated by PhysicalAddress. Preserve retired nozzles for
-- historical transaction FKs while excluding them from the active topology.

ALTER TABLE pumps
  ADD COLUMN IF NOT EXISTS doms_physical_address INTEGER;

DROP INDEX IF EXISTS ux_pumps_station_doms_port_subaddr;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pumps_station_doms_port_phys_subaddr
  ON pumps(station_id, doms_pss_port_no, doms_physical_address, doms_device_sub_address)
  WHERE doms_pss_port_no IS NOT NULL
    AND doms_physical_address IS NOT NULL
    AND doms_device_sub_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pumps_station_doms_physical_address
  ON pumps(station_id, doms_physical_address)
  WHERE doms_physical_address IS NOT NULL;

ALTER TABLE nozzles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS doms_tank_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE nozzles
   SET doms_tank_ids = jsonb_build_array(doms_tank_id)
 WHERE doms_tank_id IS NOT NULL
   AND NULLIF(BTRIM(doms_tank_id), '') IS NOT NULL
   AND doms_tank_ids = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_nozzles_station_active
  ON nozzles(station_id, is_active);

ALTER TABLE nozzles
  DROP CONSTRAINT IF EXISTS nozzles_pump_id_nozzle_number_key;

DROP INDEX IF EXISTS ux_nozzles_pump_doms_grade_option;

CREATE UNIQUE INDEX IF NOT EXISTS ux_nozzles_pump_active_number
  ON nozzles(pump_id, nozzle_number)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_nozzles_pump_doms_grade_option
  ON nozzles(pump_id, doms_grade_option_id)
  WHERE doms_grade_option_id IS NOT NULL
    AND is_active = TRUE;

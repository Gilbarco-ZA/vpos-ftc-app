-- Persist stable DOMS pump/nozzle identity separately from transport IP/port.
-- IP/port can change or be shared by multiple fuelling points; do not use it as pump identity.

ALTER TABLE pumps
  ADD COLUMN IF NOT EXISTS doms_fp_id INTEGER,
  ADD COLUMN IF NOT EXISTS doms_device_sub_address INTEGER,
  ADD COLUMN IF NOT EXISTS doms_pss_port_no INTEGER,
  ADD COLUMN IF NOT EXISTS doms_endpoint_host VARCHAR(64),
  ADD COLUMN IF NOT EXISTS doms_endpoint_port INTEGER,
  ADD COLUMN IF NOT EXISTS doms_topology_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS doms_last_seen_at TIMESTAMPTZ;

UPDATE pumps
   SET doms_fp_id = pump_number,
       doms_last_seen_at = COALESCE(doms_last_seen_at, NOW())
 WHERE doms_fp_id IS NULL
   AND pump_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pumps_station_doms_fp
  ON pumps(station_id, doms_fp_id)
  WHERE doms_fp_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pumps_station_doms_port_subaddr
  ON pumps(station_id, doms_pss_port_no, doms_device_sub_address)
  WHERE doms_pss_port_no IS NOT NULL AND doms_device_sub_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pumps_station_doms_subaddr
  ON pumps(station_id, doms_device_sub_address)
  WHERE doms_device_sub_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pumps_station_doms_endpoint
  ON pumps(station_id, doms_endpoint_host, doms_endpoint_port);

ALTER TABLE nozzles
  ADD COLUMN IF NOT EXISTS doms_grade_option_id INTEGER,
  ADD COLUMN IF NOT EXISTS doms_grade_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_tank_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_topology_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS doms_last_seen_at TIMESTAMPTZ;

UPDATE nozzles
   SET doms_grade_option_id = nozzle_number,
       doms_last_seen_at = COALESCE(doms_last_seen_at, NOW())
 WHERE doms_grade_option_id IS NULL
   AND nozzle_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_nozzles_pump_doms_grade_option
  ON nozzles(pump_id, doms_grade_option_id)
  WHERE doms_grade_option_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nozzles_station_doms_grade
  ON nozzles(station_id, doms_grade_id, doms_tank_id);

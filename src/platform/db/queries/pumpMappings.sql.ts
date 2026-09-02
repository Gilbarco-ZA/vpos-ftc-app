export const pumpMappingsSql = {
  selectRowsByStationId: `SELECT p.pump_number,
            p.doms_fp_id,
            p.doms_physical_address,
            p.doms_device_sub_address,
            p.id as pump_id,
            n.id as nozzle_id,
            n.nozzle_number,
            n.doms_grade_option_id,
            n.doms_grade_id,
            n.doms_tank_id,
            pr.product_code,
            pr.product_name
       FROM pumps p
       LEFT JOIN nozzles n ON n.pump_id = p.id AND n.station_id = p.station_id AND n.is_active = TRUE
       LEFT JOIN tanks t ON n.tank_id = t.id
       LEFT JOIN products pr ON t.product_id = pr.id
      WHERE p.station_id = $1
        AND p.status <> 'INACTIVE'
      ORDER BY COALESCE(p.doms_fp_id, p.pump_number), n.nozzle_number`,
} as const

import { queryAll } from '@/src/platform/db/postgres'

export type PumpMappingRow = {
  pump_number: number | null
  doms_fp_id: number | null
  doms_device_sub_address: number | null
  pump_id: string
  nozzle_id: string | null
  nozzle_number: number | null
  doms_grade_option_id: number | null
  doms_grade_id: string | null
  doms_tank_id: string | null
  product_code: string | null
  product_name: string | null
}

export const pumpMappingsRepo = {
  async listRowsByStationId(stationId: string) {
    return await queryAll<PumpMappingRow>(
      `SELECT p.pump_number,
              p.doms_fp_id,
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
         LEFT JOIN nozzles n ON n.pump_id = p.id AND n.station_id = p.station_id
         LEFT JOIN tanks t ON n.tank_id = t.id
         LEFT JOIN products pr ON t.product_id = pr.id
        WHERE p.station_id = $1
        ORDER BY COALESCE(p.doms_fp_id, p.pump_number), n.nozzle_number`,
      [stationId],
    )
  },
}

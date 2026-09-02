import { query, queryOne } from '@/src/platform/db/postgres'

export type PumpMappingRow = {
  id: string
  station_id: string
  pump_number: number
  code: string | null
  name: string | null
  doms_fp_id: number | null
}

export type TankMappingRow = {
  id: string
  station_id: string
  code: string | null
  name: string | null
  doms_tank_id: string | null
}

export type NozzleMappingRow = {
  id: string
  station_id: string
  pump_id: string
  nozzle_number: number
  doms_grade_option_id: number | null
  doms_grade_id: string | null
  doms_tank_id: string | null
}

export async function getPumpMappingRow(params: {
  stationId: string
  pumpId: string
}) {
  return await queryOne<PumpMappingRow>(
    `SELECT id,
            station_id,
            pump_number,
            code,
            name,
            doms_fp_id
       FROM pumps
      WHERE station_id = $1
        AND id = $2
      LIMIT 1`,
    [params.stationId, params.pumpId],
  )
}

export async function getPumpByDomsFpId(params: {
  stationId: string
  domsFpId: number
  excludePumpId?: string | null
}) {
  return await queryOne<PumpMappingRow>(
    `SELECT id,
            station_id,
            pump_number,
            code,
            name,
            doms_fp_id
       FROM pumps
      WHERE station_id = $1
        AND doms_fp_id = $2
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      LIMIT 1`,
    [params.stationId, params.domsFpId, params.excludePumpId ?? null],
  )
}

export async function updatePumpDomsFpId(params: {
  stationId: string
  pumpId: string
  domsFpId: number
}) {
  const result = await query<PumpMappingRow>(
    `UPDATE pumps
        SET doms_fp_id = $3,
            doms_last_seen_at = COALESCE(doms_last_seen_at, NOW()),
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id,
                station_id,
                pump_number,
                code,
                name,
                doms_fp_id`,
    [params.stationId, params.pumpId, params.domsFpId],
  )
  return result.rows[0] ?? null
}

export async function getTankMappingRow(params: {
  stationId: string
  tankId: string
}) {
  return await queryOne<TankMappingRow>(
    `SELECT id,
            station_id,
            code,
            name,
            doms_tank_id
       FROM tanks
      WHERE station_id = $1
        AND id = $2
      LIMIT 1`,
    [params.stationId, params.tankId],
  )
}

export async function getTankByDomsTankId(params: {
  stationId: string
  domsTankId: string
  excludeTankId?: string | null
}) {
  return await queryOne<TankMappingRow>(
    `SELECT id,
            station_id,
            code,
            name,
            doms_tank_id
       FROM tanks
      WHERE station_id = $1
        AND doms_tank_id = $2
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      LIMIT 1`,
    [params.stationId, params.domsTankId, params.excludeTankId ?? null],
  )
}

export async function updateTankDomsTankId(params: {
  stationId: string
  tankId: string
  domsTankId: string
}) {
  const result = await query<TankMappingRow>(
    `UPDATE tanks
        SET doms_tank_id = $3,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id,
                station_id,
                code,
                name,
                doms_tank_id`,
    [params.stationId, params.tankId, params.domsTankId],
  )
  return result.rows[0] ?? null
}

export async function getNozzleMappingRow(params: {
  stationId: string
  nozzleId: string
}) {
  return await queryOne<NozzleMappingRow>(
    `SELECT id,
            station_id,
            pump_id,
            nozzle_number,
            doms_grade_option_id,
            doms_grade_id,
            doms_tank_id
       FROM nozzles
      WHERE station_id = $1
        AND id = $2
      LIMIT 1`,
    [params.stationId, params.nozzleId],
  )
}

export async function getNozzleByPumpGradeOption(params: {
  stationId: string
  pumpId: string
  domsGradeOptionId: number
  excludeNozzleId?: string | null
}) {
  return await queryOne<NozzleMappingRow>(
    `SELECT id,
            station_id,
            pump_id,
            nozzle_number,
            doms_grade_option_id,
            doms_grade_id,
            doms_tank_id
       FROM nozzles
      WHERE station_id = $1
        AND pump_id = $2
        AND doms_grade_option_id = $3
        AND is_active = TRUE
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1`,
    [
      params.stationId,
      params.pumpId,
      params.domsGradeOptionId,
      params.excludeNozzleId ?? null,
    ],
  )
}

export async function updateNozzleDomsMapping(params: {
  stationId: string
  nozzleId: string
  domsGradeOptionId?: number
  domsGradeId?: string
  domsTankId?: string
}) {
  const result = await query<NozzleMappingRow>(
    `UPDATE nozzles
        SET doms_grade_option_id = COALESCE($3::integer, doms_grade_option_id),
            doms_grade_id = COALESCE($4::varchar, doms_grade_id),
            doms_tank_id = COALESCE($5::varchar, doms_tank_id),
            doms_last_seen_at = COALESCE(doms_last_seen_at, NOW()),
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id,
                station_id,
                pump_id,
                nozzle_number,
                doms_grade_option_id,
                doms_grade_id,
                doms_tank_id`,
    [
      params.stationId,
      params.nozzleId,
      params.domsGradeOptionId ?? null,
      params.domsGradeId ?? null,
      params.domsTankId ?? null,
    ],
  )
  return result.rows[0] ?? null
}

export async function setPumpDomsFpIdExact(params: {
  stationId: string
  pumpId: string
  domsFpId: number | null
}) {
  const result = await query<PumpMappingRow>(
    `UPDATE pumps
        SET doms_fp_id = $3,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id,
                station_id,
                pump_number,
                code,
                name,
                doms_fp_id`,
    [params.stationId, params.pumpId, params.domsFpId],
  )
  return result.rows[0] ?? null
}

export async function setTankDomsTankIdExact(params: {
  stationId: string
  tankId: string
  domsTankId: string | null
}) {
  const result = await query<TankMappingRow>(
    `UPDATE tanks
        SET doms_tank_id = $3,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id,
                station_id,
                code,
                name,
                doms_tank_id`,
    [params.stationId, params.tankId, params.domsTankId],
  )
  return result.rows[0] ?? null
}

export async function setNozzleDomsMappingExact(params: {
  stationId: string
  nozzleId: string
  domsGradeOptionId: number | null
  domsGradeId: string | null
  domsTankId: string | null
}) {
  const result = await query<NozzleMappingRow>(
    `UPDATE nozzles
        SET doms_grade_option_id = $3,
            doms_grade_id = $4,
            doms_tank_id = $5,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id,
                station_id,
                pump_id,
                nozzle_number,
                doms_grade_option_id,
                doms_grade_id,
                doms_tank_id`,
    [
      params.stationId,
      params.nozzleId,
      params.domsGradeOptionId,
      params.domsGradeId,
      params.domsTankId,
    ],
  )
  return result.rows[0] ?? null
}

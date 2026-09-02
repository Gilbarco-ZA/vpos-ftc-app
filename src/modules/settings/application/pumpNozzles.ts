import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { ensureTankGroup } from '@/src/modules/forecourt/application/tankGauge'

type MutationResult = { ok: true; id: string } | { ok: false; error: string }

async function pumpExists(stationId: string, pumpId: string) {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM pumps WHERE id = $1 AND station_id = $2',
    [pumpId, stationId],
  )
  return Boolean(row?.id)
}

async function tankExists(stationId: string, tankId: string) {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM tanks WHERE id = $1 AND station_id = $2',
    [tankId, stationId],
  )
  return Boolean(row?.id)
}

export async function listPumpNozzles(stationId: string, pumpId: string) {
  if (!(await pumpExists(stationId, pumpId))) {
    return { ok: false as const, error: 'Pump not found' }
  }
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT n.id,
            n.nozzle_number,
            n.tank_id,
            n.tank_group_id,
            t.name as tank_name,
            p.product_name,
            p.product_code,
            tg.name as tank_group_name
       FROM nozzles n
       JOIN tanks t ON t.id = n.tank_id
       JOIN products p ON p.id = t.product_id
  LEFT JOIN tank_groups tg ON tg.id = n.tank_group_id
      WHERE n.station_id = $1 AND n.pump_id = $2 AND n.is_active = TRUE
      ORDER BY n.nozzle_number ASC`,
    [stationId, pumpId],
  )
  return {
    ok: true as const,
    nozzles: rows.map((row) => ({
      id: String(row.id),
      nozzleNumber: Number(row.nozzle_number ?? 0),
      tankId: String(row.tank_id ?? ''),
      tankName: String(row.tank_name ?? ''),
      productName: String(row.product_name ?? ''),
      productCode: String(row.product_code ?? ''),
      tankGroupId: row.tank_group_id ? String(row.tank_group_id) : '',
      tankGroupName: String(row.tank_group_name ?? ''),
    })),
  }
}

export async function createPumpNozzle(input: {
  stationId: string
  pumpId: string
  nozzleNumber: number
  tankId: string
  tankGroup: unknown
}): Promise<MutationResult> {
  if (!(await pumpExists(input.stationId, input.pumpId))) {
    return { ok: false, error: 'Pump not found' }
  }
  if (!(await tankExists(input.stationId, input.tankId))) {
    return { ok: false, error: 'Invalid tank' }
  }
  const existing = await queryOne<{ id: string; is_active: boolean }>(
    `SELECT id, is_active FROM nozzles
      WHERE station_id = $1 AND pump_id = $2 AND nozzle_number = $3`,
    [input.stationId, input.pumpId, input.nozzleNumber],
  )
  if (existing?.id && existing.is_active) {
    return { ok: false, error: 'Nozzle number must be unique per pump' }
  }
  if (existing?.id) {
    const tankGroupId = await ensureTankGroup(input.stationId, input.tankGroup)
    await queryOne(
      `UPDATE nozzles
          SET tank_id = $1, tank_group_id = $2, is_active = TRUE, updated_at = NOW()
        WHERE id = $3 AND station_id = $4 AND pump_id = $5`,
      [input.tankId, tankGroupId, existing.id, input.stationId, input.pumpId],
    )
    return { ok: true, id: existing.id }
  }
  const id = uuidv4()
  const tankGroupId = await ensureTankGroup(input.stationId, input.tankGroup)
  const row = await queryOne<{ id: string }>(
    `INSERT INTO nozzles (id, station_id, pump_id, tank_id, nozzle_number, tank_group_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      id,
      input.stationId,
      input.pumpId,
      input.tankId,
      input.nozzleNumber,
      tankGroupId,
    ],
  )
  return { ok: true, id: String(row?.id ?? '') }
}

export async function updatePumpNozzle(input: {
  stationId: string
  pumpId: string
  nozzleId: string
  nozzleNumber: number
  tankId: string
  tankGroup: unknown
}): Promise<MutationResult> {
  if (!(await pumpExists(input.stationId, input.pumpId))) {
    return { ok: false, error: 'Pump not found' }
  }
  if (!(await tankExists(input.stationId, input.tankId))) {
    return { ok: false, error: 'Invalid tank' }
  }
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM nozzles
      WHERE station_id = $1 AND pump_id = $2 AND nozzle_number = $3`,
    [input.stationId, input.pumpId, input.nozzleNumber],
  )
  if (existing?.id && existing.id !== input.nozzleId) {
    return { ok: false, error: 'Nozzle number must be unique per pump' }
  }
  const tankGroupId = await ensureTankGroup(input.stationId, input.tankGroup)
  await queryOne(
    `UPDATE nozzles
        SET tank_id = $1,
            nozzle_number = $2,
            tank_group_id = $3,
            is_active = TRUE,
            updated_at = NOW()
      WHERE id = $4 AND station_id = $5 AND pump_id = $6`,
    [
      input.tankId,
      input.nozzleNumber,
      tankGroupId,
      input.nozzleId,
      input.stationId,
      input.pumpId,
    ],
  )
  return { ok: true, id: input.nozzleId }
}

export async function deletePumpNozzle(input: {
  stationId: string
  pumpId: string
  nozzleId: string
}): Promise<MutationResult> {
  await queryOne(
    `UPDATE nozzles
        SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND station_id = $2 AND pump_id = $3`,
    [input.nozzleId, input.stationId, input.pumpId],
  )
  return { ok: true, id: input.nozzleId }
}

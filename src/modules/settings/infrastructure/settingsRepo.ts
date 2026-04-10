import type { PumpModeConfig } from '@/src/shared/settings/pumpMode'
import type { TankConfig } from '@/src/shared/settings/tanksConfig'

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import {
  getConsoleSettingsValue,
  saveConsoleSettingsValue,
} from '@/src/shared/settings/console'
import {
  getPumpModeConfig,
  savePumpModeConfig,
} from '@/src/shared/settings/pumpMode'
import { KV_KEYS } from '@/src/shared/settings/tanksConfig'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export type PumpSettingsRow = Record<string, unknown>
export type TankSettingsRow = Record<string, unknown>
export type ProductSettingsRow = Record<string, unknown>

export async function getConsoleSettingsRepo(
  stationId: string,
): Promise<Record<string, unknown> | null> {
  return await getConsoleSettingsValue<Record<string, unknown>>(stationId)
}

export async function saveConsoleSettingsRepo(
  stationId: string,
  value: Record<string, unknown>,
): Promise<void> {
  await saveConsoleSettingsValue(stationId, value)
}

export async function listPumpNumbersRepo(
  stationId: string,
): Promise<number[]> {
  const pumps = await queryAll<{ pump_number: number }>(
    `SELECT pump_number
       FROM pumps
      WHERE station_id = $1
      ORDER BY pump_number ASC`,
    [stationId],
  )
  return pumps
    .map((row) => Number(row.pump_number))
    .filter((value) => Number.isFinite(value))
}

export async function getPumpModeConfigRepo(
  stationId: string,
): Promise<PumpModeConfig | null> {
  return await getPumpModeConfig(stationId)
}

export async function savePumpModeConfigRepo(
  stationId: string,
  value: PumpModeConfig,
): Promise<void> {
  await savePumpModeConfig(stationId, value)
}

export async function getTankConfigRepo(
  stationId: string,
): Promise<TankConfig | null> {
  return await kvGet<TankConfig>(stationId, KV_KEYS.TANKS_CONFIG)
}

export async function saveTankConfigRepo(
  stationId: string,
  value: TankConfig,
): Promise<void> {
  await kvSet(stationId, KV_KEYS.TANKS_CONFIG, value)
}

export async function listPumpsRepo(
  stationId: string,
): Promise<PumpSettingsRow[]> {
  return await queryAll<PumpSettingsRow>(
    `SELECT p.id,
            p.code,
            p.name,
            p.status,
            p.has_nozzle_selector,
            p.pump_number,
            p.tank_group_id,
            tg.name as tank_group_name
       FROM pumps p
  LEFT JOIN tank_groups tg ON tg.id = p.tank_group_id
      WHERE p.station_id = $1
      ORDER BY p.pump_number ASC`,
    [stationId],
  )
}

export async function findPumpByCodeRepo(stationId: string, code: string) {
  return await queryOne<{ id: string }>(
    `SELECT id FROM pumps WHERE station_id = $1 AND code = $2`,
    [stationId, code],
  )
}

export async function findPumpByNumberRepo(
  stationId: string,
  pumpNumber: number,
) {
  return await queryOne<{ id: string }>(
    `SELECT id FROM pumps WHERE station_id = $1 AND pump_number = $2`,
    [stationId, pumpNumber],
  )
}

export async function createPumpRepo(input: {
  id: string
  stationId: string
  code: string
  name: string
  status: string
  hasNozzleSelector: boolean
  pumpNumber: number
  tankGroupId: string | null
}) {
  return await queryOne<Record<string, unknown>>(
    `INSERT INTO pumps (
       id,
       station_id,
       code,
       name,
       status,
       has_nozzle_selector,
       pump_number,
       tank_group_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.id,
      input.stationId,
      input.code,
      input.name,
      input.status,
      input.hasNozzleSelector,
      input.pumpNumber,
      input.tankGroupId,
    ],
  )
}

export async function updatePumpRepo(input: {
  stationId: string
  id: string
  code: string
  name: string
  status: string
  hasNozzleSelector: boolean
  pumpNumber: number
  tankGroupId: string | null
}) {
  await queryOne(
    `UPDATE pumps
        SET code = $1,
            name = $2,
            status = $3,
            has_nozzle_selector = $4,
            pump_number = $5,
            tank_group_id = $6,
            updated_at = NOW()
      WHERE id = $7 AND station_id = $8`,
    [
      input.code,
      input.name,
      input.status,
      input.hasNozzleSelector,
      input.pumpNumber,
      input.tankGroupId,
      input.id,
      input.stationId,
    ],
  )
}

export async function listTanksRepo(
  stationId: string,
): Promise<TankSettingsRow[]> {
  return await queryAll<TankSettingsRow>(
    `SELECT t.id,
            t.code,
            t.name,
            t.status,
            t.product_id,
            t.capacity_litres,
            t.low_level_litres,
            t.critical_level_litres,
            t.tank_group_id,
            t.doms_tank_id,
            t.live_volume_litres,
            t.live_volume_updated_at,
            t.manual_volume_litres,
            t.manual_volume_recorded_at,
            t.manual_volume_recorded_by,
            tg.name as tank_group_name,
            p.product_name,
            p.product_code,
            p.product_id as product_external_id
       FROM tanks t
       JOIN products p ON p.id = t.product_id
  LEFT JOIN tank_groups tg ON tg.id = t.tank_group_id
      WHERE t.station_id = $1
      ORDER BY t.updated_at DESC`,
    [stationId],
  )
}

export async function listProductsRepo(
  stationId: string,
): Promise<ProductSettingsRow[]> {
  return await queryAll<ProductSettingsRow>(
    `SELECT id, product_name, product_code
       FROM products
      WHERE station_id = $1
      ORDER BY product_name ASC`,
    [stationId],
  )
}

export async function findProductRepo(stationId: string, productId: string) {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM products WHERE station_id = $1 AND id = $2`,
    [stationId, productId],
  )
  return row?.id ?? null
}

export async function tankHasNozzlesRepo(stationId: string, tankId: string) {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM nozzles WHERE station_id = $1 AND tank_id = $2
     ) as exists`,
    [stationId, tankId],
  )
  return Boolean(row?.exists)
}

export async function findTankByCodeRepo(stationId: string, code: string) {
  return await queryOne<{ id: string }>(
    `SELECT id FROM tanks WHERE station_id = $1 AND code = $2`,
    [stationId, code],
  )
}

export async function getTankProductRepo(stationId: string, tankId: string) {
  return await queryOne<{ product_id: string }>(
    `SELECT product_id FROM tanks WHERE id = $1 AND station_id = $2`,
    [tankId, stationId],
  )
}

export async function createTankRepo(input: {
  id: string
  stationId: string
  code: string
  name: string
  productId: string
  capacity: number
  status: string
  low: number | null
  critical: number | null
  tankGroupId: string | null
  domsTankId: string | null
  manualVolumeLitres: number | null
  recordedBy: string | null
}) {
  return await queryOne<Record<string, unknown>>(
    `INSERT INTO tanks (
       id,
       station_id,
       code,
       name,
       product_id,
       capacity_litres,
       status,
       low_level_litres,
       critical_level_litres,
       tank_group_id,
       doms_tank_id,
       manual_volume_litres,
       manual_volume_recorded_at,
       manual_volume_recorded_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $12 IS NULL THEN NULL ELSE NOW() END, CASE WHEN $12 IS NULL THEN NULL ELSE $13 END)
     RETURNING id`,
    [
      input.id,
      input.stationId,
      input.code,
      input.name,
      input.productId,
      input.capacity,
      input.status,
      input.low,
      input.critical,
      input.tankGroupId,
      input.domsTankId,
      input.manualVolumeLitres,
      input.recordedBy,
    ],
  )
}

export async function updateTankRepo(input: {
  stationId: string
  id: string
  code: string
  name: string
  productId: string
  capacity: number
  status: string
  low: number | null
  critical: number | null
  tankGroupId: string | null
  domsTankId: string | null
  manualVolumeLitres: number | null
  recordedBy: string | null
}) {
  await queryOne(
    `UPDATE tanks
      SET code = $1,
          name = $2,
          product_id = $3,
          capacity_litres = $4,
          status = $5,
          low_level_litres = $6,
          critical_level_litres = $7,
          tank_group_id = $8::uuid,
          doms_tank_id = $9::varchar(10),
          manual_volume_litres = $10::decimal(12,3),
          manual_volume_recorded_at = CASE WHEN $10::decimal(12,3) IS NULL THEN manual_volume_recorded_at ELSE NOW() END,
          manual_volume_recorded_by = CASE WHEN $10::decimal(12,3) IS NULL THEN manual_volume_recorded_by ELSE $11::varchar(255) END,
          updated_at = NOW()
    WHERE id = $12 AND station_id = $13`,
    [
      input.code,
      input.name,
      input.productId,
      input.capacity,
      input.status,
      input.low,
      input.critical,
      input.tankGroupId,
      input.domsTankId,
      input.manualVolumeLitres,
      input.recordedBy,
      input.id,
      input.stationId,
    ],
  )
}

export async function deleteTankRepo(stationId: string, tankId: string) {
  await queryOne(`DELETE FROM tanks WHERE id = $1 AND station_id = $2`, [
    tankId,
    stationId,
  ])
}

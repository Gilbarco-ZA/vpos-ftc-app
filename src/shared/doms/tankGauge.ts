import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { normalizeJplTankGaugeData } from '@/src/shared/doms/tankGaugeProtocol'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type NormalizedTgData = {
  tgId: string
  tankProductLevel: number | null
  tankWaterLevel: number | null
  tankTotalObservedVol: number | null
  tankWaterVol: number | null
  tankGrossObservedVol: number | null
  tankGrossStdVol: number | null
  tankAvailableRoom: number | null
  tankAverageTempC: number | null
  tankDataLastUpdateAt: string | null
  tankMaxSafeFillCapacity: number | null
  tankShellCapacity: number | null
  tankProductMass: number | null
  tankProductDensity: number | null
  tankProductTcDensity: number | null
  tankDensityProbeTempC: number | null
  tankSludgeLevel: number | null
  tankOilSepOilThickness: number | null
  tankOilSepOilVolume: number | null
  tankTempSensor1C: number | null
  tankTempSensor2C: number | null
  tankTempSensor3C: number | null
  tankPressure: number | null
  tankAdjustedVolume?: number | null
  tankAdjustedTCVolume?: number | null
  tankDeliveredVol?: number | null
  tankDeliveredTcVol?: number | null
  tankDeliveredMass?: number | null
  tankDeliveredQuantity?: number | null
  tgProductCode?: string | null
  tankGroupId?: string | null
  tankGaugeType?: string | null
  tankInflowControlMode?: string | null
  sourcePayload: Record<string, unknown>
}

const toConfiguredTgId = (value: unknown): string | null => {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const normalized = raw.padStart(2, '0')
  return normalized === '00' ? null : normalized
}

export async function resolveConfiguredTankGaugeIds(stationId: string) {
  if (!stationId) return []

  const rows = await queryAll<{
    doms_tank_id: string | null
    code: string | null
  }>(
    `SELECT doms_tank_id, code
       FROM tanks
      WHERE station_id = $1
      ORDER BY COALESCE(NULLIF(doms_tank_id, ''), code, '') ASC, updated_at DESC`,
    [stationId],
  )

  const ids: string[] = []
  for (const row of rows) {
    const tgId =
      toConfiguredTgId(row.doms_tank_id) ?? toConfiguredTgId(row.code)
    if (tgId) ids.push(tgId)
  }

  return Array.from(new Set(ids))
}

export async function resolveTankRecordsByGaugeIds(stationId: string) {
  if (!stationId)
    return new Map<
      string,
      { tankId: string; code: string | null; name: string | null }
    >()

  const rows = await queryAll<{
    id: string
    doms_tank_id: string | null
    code: string | null
    name: string | null
  }>(
    `SELECT id, doms_tank_id, code, name
       FROM tanks
      WHERE station_id = $1`,
    [stationId],
  )

  const byGaugeId = new Map<
    string,
    { tankId: string; code: string | null; name: string | null }
  >()

  for (const row of rows) {
    const configuredId =
      toConfiguredTgId(row.doms_tank_id) ?? toConfiguredTgId(row.code)
    if (!configuredId || byGaugeId.has(configuredId)) continue
    byGaugeId.set(configuredId, {
      tankId: row.id,
      code: row.code ?? null,
      name: row.name ?? null,
    })
  }

  return byGaugeId
}

export const normalizeTgDataPayload = (
  payload: unknown,
): NormalizedTgData | null => {
  const normalized = normalizeJplTankGaugeData(payload)
  if (!normalized) return null

  return {
    tgId: normalized.tgId,
    tankProductLevel: normalized.productLevel,
    tankWaterLevel: normalized.waterLevel,
    tankTotalObservedVol: normalized.totalObservedVolume,
    tankWaterVol: normalized.waterVolume,
    tankGrossObservedVol: normalized.grossObservedVolume,
    tankGrossStdVol: normalized.grossStandardVolume,
    tankAvailableRoom: normalized.availableRoom,
    tankAverageTempC: normalized.averageTemperatureC,
    tankDataLastUpdateAt: normalized.lastUpdatedAt,
    tankMaxSafeFillCapacity: normalized.maxSafeFillCapacity,
    tankShellCapacity: normalized.shellCapacity,
    tankProductMass: normalized.productMass,
    tankProductDensity: normalized.productDensity,
    tankProductTcDensity: normalized.productTcDensity,
    tankDensityProbeTempC: normalized.densityProbeTemperatureC,
    tankSludgeLevel: normalized.sludgeLevel,
    tankOilSepOilThickness: normalized.oilSeparatorOilThickness,
    tankOilSepOilVolume: normalized.oilSeparatorOilVolume,
    tankTempSensor1C: normalized.tempSensor1C,
    tankTempSensor2C: normalized.tempSensor2C,
    tankTempSensor3C: normalized.tempSensor3C,
    tankPressure: normalized.pressure,
    tankAdjustedVolume: normalized.adjustedVolume,
    tankAdjustedTCVolume: normalized.adjustedTcVolume,
    tankDeliveredVol: normalized.deliveredVolume,
    tankDeliveredTcVol: normalized.deliveredTcVolume,
    tankDeliveredMass: normalized.deliveredMass,
    tankDeliveredQuantity: normalized.deliveredQuantity,
    tgProductCode: normalized.productCode ?? null,
    tankGroupId: normalized.groupId ?? null,
    tankGaugeType: normalized.gaugeType ?? null,
    tankInflowControlMode: normalized.inflowControlMode ?? null,
    sourcePayload: normalized.raw,
  }
}

export const normalizeTgDataCollection = (
  payload: unknown,
): NormalizedTgData[] => {
  const items =
    (payload as any)?.data?.TgDataList ??
    (payload as any)?.TgDataList ??
    (payload as any)?.data ??
    payload
  if (!Array.isArray(items)) return []
  return items
    .map((entry) => normalizeTgDataPayload(entry))
    .filter(Boolean) as NormalizedTgData[]
}

export async function syncTankGaugeVolumes(
  stationId: string,
  items: NormalizedTgData[],
) {
  const tanks = await queryAll<{
    id: string
    code: string | null
    doms_tank_id: string | null
  }>(
    `SELECT id, code, doms_tank_id
       FROM tanks
      WHERE station_id = $1`,
    [stationId],
  )

  const tankIdByGaugeId = new Map<string, string>()
  for (const tank of tanks) {
    const configuredId = toConfiguredTgId(tank.doms_tank_id)
    if (configuredId && !tankIdByGaugeId.has(configuredId)) {
      tankIdByGaugeId.set(configuredId, tank.id)
    }
    const fallbackId = toConfiguredTgId(tank.code)
    if (fallbackId && !tankIdByGaugeId.has(fallbackId)) {
      tankIdByGaugeId.set(fallbackId, tank.id)
    }
  }

  const updates: Array<{
    tankId: string
    tgId: string
    gross: number | null
    water: number | null
    updatedAt: string | null
  }> = []

  for (const item of items) {
    const tgId = toConfiguredTgId(item.tgId)
    if (!tgId) continue

    const tankId = tankIdByGaugeId.get(tgId)
    if (!tankId) continue

    const liveVolumeLitres =
      item.tankGrossObservedVol ??
      item.tankTotalObservedVol ??
      item.tankGrossStdVol ??
      null

    await queryOne(
      `UPDATE tanks
          SET live_volume_litres = COALESCE($3, live_volume_litres),
              live_volume_updated_at = CASE
                WHEN $4::timestamptz IS NOT NULL THEN $4::timestamptz
                WHEN $3 IS NOT NULL THEN NOW()
                ELSE live_volume_updated_at
              END,
              last_tg_payload = $5::jsonb,
              updated_at = NOW()
        WHERE station_id = $1 AND id = $2`,
      [
        stationId,
        tankId,
        liveVolumeLitres,
        item.tankDataLastUpdateAt,
        JSON.stringify(item.sourcePayload ?? {}),
      ],
    )

    updates.push({
      tankId,
      tgId,
      gross: liveVolumeLitres,
      water: item.tankWaterVol,
      updatedAt: item.tankDataLastUpdateAt,
    })
  }

  return { ok: true, updated: updates.length, tanks: updates }
}

export async function resolveTankGroups(stationId: string) {
  return await queryAll<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM tank_groups WHERE station_id = $1 ORDER BY name ASC`,
    [stationId],
  )
}

export async function ensureTankGroup(stationId: string, input: unknown) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const existingById = await queryOne<{ id: string }>(
    `SELECT id FROM tank_groups WHERE station_id = $1 AND id = $2`,
    [stationId, raw],
  )
  if (existingById?.id) return existingById.id
  const normalized =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || raw.slice(0, 50)
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM tank_groups WHERE station_id = $1 AND code = $2`,
    [stationId, normalized],
  )
  if (existing?.id) return existing.id
  const id = uuidv4()
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO tank_groups (id, station_id, code, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
    [id, stationId, normalized, raw],
  )
  return inserted?.id ?? null
}

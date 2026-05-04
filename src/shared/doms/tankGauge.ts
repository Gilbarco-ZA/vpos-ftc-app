import { queryAll, queryOne } from '@/src/platform/db/postgres'
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

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export const decodeSignedTemperature = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null
  const temp = toNumberOrNull((value as any).Temperature)
  if (temp === null) return null
  const sign = String((value as any)?.FcSign?.value ?? '00H').toUpperCase()
  const signed = temp / 10
  return sign === '80H' ? -signed : signed
}

export const parseFcDateAndTime = (value: unknown): string | null => {
  const raw = String(value ?? '').replace(/\D/g, '')
  if (raw.length !== 14) return null
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const normalizeTgDataPayload = (
  payload: unknown,
): NormalizedTgData | null => {
  const data = (payload as any)?.data ?? payload
  const tgId = String((data as any)?.TgId ?? (data as any)?.TankId ?? '').trim()
  if (!tgId) return null
  const items = (data as any)?.TankDataItems ?? {}
  return {
    tgId,
    tankProductLevel: toNumberOrNull((items as any).TankProductLevel),
    tankWaterLevel: toNumberOrNull((items as any).TankWaterLevel),
    tankTotalObservedVol: toNumberOrNull((items as any).TankTotalObservedVol),
    tankWaterVol: toNumberOrNull((items as any).TankWaterVol),
    tankGrossObservedVol: toNumberOrNull((items as any).TankGrossObservedVol),
    tankGrossStdVol: toNumberOrNull((items as any).TankGrossStdVol),
    tankAvailableRoom: toNumberOrNull((items as any).TankAvailableRoom),
    tankAverageTempC: decodeSignedTemperature((items as any).TankAverageTemp),
    tankDataLastUpdateAt: parseFcDateAndTime(
      (items as any).TankDataLastUpdateDateAndTime,
    ),
    tankMaxSafeFillCapacity: toNumberOrNull(
      (items as any).TankMaxSafeFillCapacity,
    ),
    tankShellCapacity: toNumberOrNull((items as any).TankShellCapacity),
    tankProductMass: toNumberOrNull((items as any).TankProductMass),
    tankProductDensity: toNumberOrNull((items as any).TankProductDensity),
    tankProductTcDensity: toNumberOrNull((items as any).TankProductTcDensity),
    tankDensityProbeTempC: decodeSignedTemperature(
      (items as any).TankDensityProbeTemp,
    ),
    tankSludgeLevel: toNumberOrNull((items as any).TankSludgeLevel),
    tankOilSepOilThickness: toNumberOrNull(
      (items as any).TankOilSepOilThickness,
    ),
    tankOilSepOilVolume: toNumberOrNull((items as any).TankOilSepOilVolume),
    tankTempSensor1C: decodeSignedTemperature((items as any).TankTempSensor1),
    tankTempSensor2C: decodeSignedTemperature((items as any).TankTempSensor2),
    tankTempSensor3C: decodeSignedTemperature((items as any).TankTempSensor3),
    tankPressure: toNumberOrNull((items as any).TankPressure),
    sourcePayload:
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
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

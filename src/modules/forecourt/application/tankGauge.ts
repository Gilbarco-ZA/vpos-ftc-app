import {
  queryAll,
  queryOne,
  txQuery,
  withTransaction,
} from '@/src/platform/db/postgres'
import { normalizeJplTankGaugeData } from '@/src/shared/doms/tankGaugeProtocol'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { buildTankGaugeDiagnostics } from '@/src/modules/forecourt/domain/tankGaugeDiagnostics'

export type NormalizedTgData = {
  tgId: string
  gaugeOnline: boolean
  inventoryDataReady: boolean
  gaugeAlarmActive: boolean
  gaugeErrorActive: boolean
  tankId?: string | null
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

export async function resolveStationTimeZone(stationId: string) {
  if (!stationId) return 'UTC'

  const row = await queryOne<{ timezone: string | null }>(
    `SELECT timezone FROM fuel_stations WHERE id = $1`,
    [stationId],
  )
  const timeZone = String(row?.timezone ?? '').trim()
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
    return timeZone
  } catch {
    return 'UTC'
  }
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
  options: { timeZone?: string | null } = {},
): NormalizedTgData | null => {
  const normalized = normalizeJplTankGaugeData(payload, options)
  if (!normalized) return null

  return {
    tgId: normalized.tgId,
    gaugeOnline: normalized.flags.online,
    inventoryDataReady: normalized.flags.allInventoryDataReady,
    gaugeAlarmActive: normalized.flags.alarmActive,
    gaugeErrorActive: normalized.flags.errorActive,
    tankId: normalized.tankId ?? null,
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

type TankGaugePersistenceOptions = {
  recordedAt?: string
}

type TankGaugeStorageRow = {
  id: string
  code: string | null
  name: string | null
  doms_tank_id: string | null
  capacity_litres: number | string | null
  product_id: string | null
  product_name: string | null
}

const positiveNumberOrNull = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function persistTankGaugeSnapshot(
  stationId: string,
  items: NormalizedTgData[],
  options: TankGaugePersistenceOptions = {},
) {
  const tanks = await queryAll<TankGaugeStorageRow>(
    `SELECT t.id,
            t.code,
            t.name,
            t.doms_tank_id,
            t.capacity_litres,
            t.product_id,
            p.product_name
       FROM tanks t
  LEFT JOIN products p
         ON p.id = t.product_id
        AND p.station_id = t.station_id
      WHERE t.station_id = $1`,
    [stationId],
  )

  const tankByGaugeId = new Map<string, TankGaugeStorageRow>()
  for (const tank of tanks) {
    const configuredId = toConfiguredTgId(tank.doms_tank_id)
    if (configuredId && !tankByGaugeId.has(configuredId)) {
      tankByGaugeId.set(configuredId, tank)
    }
    const fallbackId = toConfiguredTgId(tank.code)
    if (fallbackId && !tankByGaugeId.has(fallbackId)) {
      tankByGaugeId.set(fallbackId, tank)
    }
  }

  const updates: Array<{
    tankId: string
    tgId: string
    gross: number | null
    water: number | null
    updatedAt: string | null
  }> = []

  const recordedAt = options.recordedAt ?? new Date().toISOString()

  await withTransaction(async (client) => {
    for (const item of items) {
      const tgId = toConfiguredTgId(item.tgId)
      if (!tgId) continue

      const tank = tankByGaugeId.get(tgId)
      if (!tank) continue

      const liveVolumeLitres =
        item.tankGrossObservedVol ??
        item.tankTotalObservedVol ??
        item.tankGrossStdVol ??
        null
      const tcVolumeLitres =
        item.tankGrossStdVol ?? item.tankAdjustedTCVolume ?? null
      const liveTemperatureC = item.tankAverageTempC ?? null
      const effectiveCapacityLitres =
        positiveNumberOrNull(tank.capacity_litres) ??
        positiveNumberOrNull(item.tankShellCapacity) ??
        positiveNumberOrNull(item.tankMaxSafeFillCapacity)
      const diagnostics = buildTankGaugeDiagnostics({
        tgId,
        capturedAt: item.tankDataLastUpdateAt,
        liveVolumeLitres,
        productLevel: item.tankProductLevel,
        waterLevel: item.tankWaterLevel,
        waterVolumeLitres: item.tankWaterVol,
        availableRoomLitres: item.tankAvailableRoom,
        averageTemperatureC: item.tankAverageTempC,
        pressure: item.tankPressure,
        productCode: item.tgProductCode,
        gaugeType: item.tankGaugeType,
        gaugeOnline: item.gaugeOnline,
        inventoryDataReady: item.inventoryDataReady,
        gaugeAlarmActive: item.gaugeAlarmActive,
        gaugeErrorActive: item.gaugeErrorActive,
        sourcePayload: item.sourcePayload,
      })

      await txQuery(
        client,
        `UPDATE tanks
            SET live_volume_litres = COALESCE($3, live_volume_litres),
                live_tc_volume_litres = COALESCE($4, live_tc_volume_litres),
                live_temperature_c = COALESCE($5, live_temperature_c),
                live_volume_updated_at = CASE
                  WHEN $6::timestamptz IS NOT NULL THEN $6::timestamptz
                  WHEN $3 IS NOT NULL OR $4 IS NOT NULL OR $5 IS NOT NULL THEN $7::timestamptz
                  ELSE live_volume_updated_at
                END,
                last_tg_diagnostics = $8::jsonb,
                last_tg_payload_hash = $9,
                last_tg_payload = NULL,
                last_tg_payload_cleared_at = CASE
                  WHEN last_tg_payload IS NOT NULL THEN NOW()
                  ELSE last_tg_payload_cleared_at
                END,
                last_tg_payload_clear_reason = CASE
                  WHEN last_tg_payload IS NOT NULL THEN 'replaced_by_compact_diagnostics'
                  ELSE last_tg_payload_clear_reason
                END,
                updated_at = NOW()
          WHERE station_id = $1 AND id = $2`,
        [
          stationId,
          tank.id,
          liveVolumeLitres,
          tcVolumeLitres,
          liveTemperatureC,
          item.tankDataLastUpdateAt,
          recordedAt,
          JSON.stringify(diagnostics),
          diagnostics.sourcePayloadHash,
        ],
      )

      await txQuery(
        client,
        `INSERT INTO tank_atg_capture_evidence (
           station_id,
           tank_id,
           product_id,
           tg_id,
           doms_tank_id,
           captured_at,
           controller_updated_at,
           volume_litres,
           source_payload_hash
         ) VALUES (
           $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9
         )
         ON CONFLICT (tank_id, captured_at) DO NOTHING`,
        [
          stationId,
          tank.id,
          tank.product_id,
          tgId,
          item.tankId ?? tgId,
          recordedAt,
          item.tankDataLastUpdateAt,
          liveVolumeLitres,
          diagnostics.sourcePayloadHash,
        ],
      )

      await txQuery(
        client,
        `INSERT INTO tank_atg_snapshots (
           tank_id,
           station_id,
           product_id,
           tg_id,
           doms_tank_id,
           captured_at,
           controller_updated_at,
           product_name,
           tank_name,
           capacity_litres,
           temperature_c,
           tc_volume_litres,
           volume_litres,
           product_level,
           water_level,
           total_observed_volume_litres,
           water_volume_litres,
           gross_observed_volume_litres,
           gross_standard_volume_litres,
           available_room_litres,
           max_safe_fill_capacity_litres,
           shell_capacity_litres,
           product_mass,
           product_density,
           product_tc_density,
           density_probe_temperature_c,
           sludge_level,
           oil_separator_oil_thickness,
           oil_separator_oil_volume,
           temp_sensor_1_c,
           temp_sensor_2_c,
           temp_sensor_3_c,
           pressure,
           adjusted_volume_litres,
           adjusted_tc_volume_litres,
           delivered_volume_litres,
           delivered_tc_volume_litres,
           delivered_mass,
           delivered_quantity,
           tg_product_code,
           tank_group_id,
           tank_gauge_type,
           tank_inflow_control_mode,
           gauge_online,
           inventory_data_ready,
           gauge_alarm_active,
           gauge_error_active,
           source_payload_hash
         ) VALUES (
           $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz,
           $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
           $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
           $41, $42, $43, $44, $45, $46, $47, $48
         )
         ON CONFLICT (tank_id) DO UPDATE SET
           station_id = EXCLUDED.station_id,
           product_id = EXCLUDED.product_id,
           tg_id = EXCLUDED.tg_id,
           doms_tank_id = EXCLUDED.doms_tank_id,
           captured_at = EXCLUDED.captured_at,
           controller_updated_at = EXCLUDED.controller_updated_at,
           product_name = EXCLUDED.product_name,
           tank_name = EXCLUDED.tank_name,
           capacity_litres = EXCLUDED.capacity_litres,
           temperature_c = EXCLUDED.temperature_c,
           tc_volume_litres = EXCLUDED.tc_volume_litres,
           volume_litres = EXCLUDED.volume_litres,
           product_level = EXCLUDED.product_level,
           water_level = EXCLUDED.water_level,
           total_observed_volume_litres = EXCLUDED.total_observed_volume_litres,
           water_volume_litres = EXCLUDED.water_volume_litres,
           gross_observed_volume_litres = EXCLUDED.gross_observed_volume_litres,
           gross_standard_volume_litres = EXCLUDED.gross_standard_volume_litres,
           available_room_litres = EXCLUDED.available_room_litres,
           max_safe_fill_capacity_litres = EXCLUDED.max_safe_fill_capacity_litres,
           shell_capacity_litres = EXCLUDED.shell_capacity_litres,
           product_mass = EXCLUDED.product_mass,
           product_density = EXCLUDED.product_density,
           product_tc_density = EXCLUDED.product_tc_density,
           density_probe_temperature_c = EXCLUDED.density_probe_temperature_c,
           sludge_level = EXCLUDED.sludge_level,
           oil_separator_oil_thickness = EXCLUDED.oil_separator_oil_thickness,
           oil_separator_oil_volume = EXCLUDED.oil_separator_oil_volume,
           temp_sensor_1_c = EXCLUDED.temp_sensor_1_c,
           temp_sensor_2_c = EXCLUDED.temp_sensor_2_c,
           temp_sensor_3_c = EXCLUDED.temp_sensor_3_c,
           pressure = EXCLUDED.pressure,
           adjusted_volume_litres = EXCLUDED.adjusted_volume_litres,
           adjusted_tc_volume_litres = EXCLUDED.adjusted_tc_volume_litres,
           delivered_volume_litres = EXCLUDED.delivered_volume_litres,
           delivered_tc_volume_litres = EXCLUDED.delivered_tc_volume_litres,
           delivered_mass = EXCLUDED.delivered_mass,
           delivered_quantity = EXCLUDED.delivered_quantity,
           tg_product_code = EXCLUDED.tg_product_code,
           tank_group_id = EXCLUDED.tank_group_id,
           tank_gauge_type = EXCLUDED.tank_gauge_type,
           tank_inflow_control_mode = EXCLUDED.tank_inflow_control_mode,
           gauge_online = EXCLUDED.gauge_online,
           inventory_data_ready = EXCLUDED.inventory_data_ready,
           gauge_alarm_active = EXCLUDED.gauge_alarm_active,
           gauge_error_active = EXCLUDED.gauge_error_active,
           source_payload_hash = EXCLUDED.source_payload_hash,
           updated_at = CURRENT_TIMESTAMP`,
        [
          tank.id,
          stationId,
          tank.product_id,
          tgId,
          item.tankId ?? tgId,
          recordedAt,
          item.tankDataLastUpdateAt,
          tank.product_name,
          tank.name,
          effectiveCapacityLitres,
          item.tankAverageTempC,
          tcVolumeLitres,
          liveVolumeLitres,
          item.tankProductLevel,
          item.tankWaterLevel,
          item.tankTotalObservedVol,
          item.tankWaterVol,
          item.tankGrossObservedVol,
          item.tankGrossStdVol,
          item.tankAvailableRoom,
          item.tankMaxSafeFillCapacity,
          item.tankShellCapacity,
          item.tankProductMass,
          item.tankProductDensity,
          item.tankProductTcDensity,
          item.tankDensityProbeTempC,
          item.tankSludgeLevel,
          item.tankOilSepOilThickness,
          item.tankOilSepOilVolume,
          item.tankTempSensor1C,
          item.tankTempSensor2C,
          item.tankTempSensor3C,
          item.tankPressure,
          item.tankAdjustedVolume,
          item.tankAdjustedTCVolume,
          item.tankDeliveredVol,
          item.tankDeliveredTcVol,
          item.tankDeliveredMass,
          item.tankDeliveredQuantity,
          item.tgProductCode,
          item.tankGroupId,
          item.tankGaugeType,
          item.tankInflowControlMode,
          item.gaugeOnline,
          item.inventoryDataReady,
          item.gaugeAlarmActive,
          item.gaugeErrorActive,
          diagnostics.sourcePayloadHash,
        ],
      )

      updates.push({
        tankId: tank.id,
        tgId,
        gross: liveVolumeLitres,
        water: item.tankWaterVol,
        updatedAt: item.tankDataLastUpdateAt,
      })
    }

    // This is a short operational evidence window, not a second long-term ATG
    // archive. Persisted transaction projections copy the exact baseline they
    // use, so evidence older than 30 days can be removed safely.
    await txQuery(
      client,
      `DELETE FROM tank_atg_capture_evidence
        WHERE station_id = $1::uuid
          AND captured_at < NOW() - INTERVAL '30 days'`,
      [stationId],
    )
  })

  return {
    ok: true,
    updated: updates.length,
    snapshotsSaved: updates.length,
    tanks: updates,
  }
}

export async function syncTankGaugeVolumes(
  stationId: string,
  items: NormalizedTgData[],
  options: { recordedAt?: string } = {},
) {
  return await persistTankGaugeSnapshot(stationId, items, options)
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
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    )
  if (isUuid) {
    const existingById = await queryOne<{ id: string }>(
      `SELECT id FROM tank_groups WHERE station_id = $1 AND id = $2::uuid`,
      [stationId, raw],
    )
    if (existingById?.id) return existingById.id
  }
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

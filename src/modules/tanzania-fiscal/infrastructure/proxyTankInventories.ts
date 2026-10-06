import { queryAll } from '@/src/platform/db/postgres'

import { submitTanzaniaTankInventoriesToProxy } from '@/src/modules/transactions/infrastructure/fiscalization/proxyClient'

import { getStationCountryCode, isTanzaniaCountry } from './country'

export type TanzaniaTankInventoryItem = {
  product_name: string
  tank_name: string
  capacity: string
  Temperature: string
  TC_Volume: string
  Volume: string
  Tank_ID: string
}

export type TanzaniaTankInventoriesRequest = {
  data: TanzaniaTankInventoryItem[]
}

export type AtgPublicationReading = {
  tgId: string
  domsTankId?: string | null
  temperatureC: number | null
  tcVolumeLitres: number | null
  volumeLitres: number | null
  shellCapacityLitres?: number | null
  maxSafeFillCapacityLitres?: number | null
  gaugeOnline?: boolean
  inventoryDataReady?: boolean
  gaugeAlarmActive?: boolean
  gaugeErrorActive?: boolean
  controllerUpdatedAt?: string | null
}

export type AtgSnapshotPublication = {
  recordedAt: string
  requestedTgIds: string[]
  snapshotsSaved: number
  publicationReadings?: AtgPublicationReading[]
}

export type TanzaniaAtgSnapshotRow = {
  product_name: string | null
  tank_name: string | null
  capacity_litres: string | number | null
  temperature_c: string | number | null
  tc_volume_litres: string | number | null
  volume_litres: string | number | null
  doms_tank_id: string | null
  tg_id: string
}

export type TanzaniaTankPublicationMetadataRow = {
  product_name: string | null
  tank_name: string | null
  capacity_litres: string | number | null
  doms_tank_id: string | null
  tg_id: string
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`Tanzania ATG payload requires ${field}`)
  return text
}

function requiredNumber(value: unknown, field: string): number {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new Error(`Tanzania ATG payload requires numeric ${field}`)
  }
  return number
}

function formatDecimal(value: unknown, field: string): string {
  const number = requiredNumber(value, field)
  const raw = String(value ?? '')
    .trim()
    .replace(/^\+/, '')
  const plain = /^-?\d+(?:\.\d+)?$/.test(raw) ? raw : String(number)

  if (!plain.includes('.')) return `${plain}.0`

  const [whole, fraction = ''] = plain.split('.')
  const trimmedFraction = fraction.replace(/0+$/, '')
  return `${whole}.${trimmedFraction || '0'}`
}

function formatCapacity(value: unknown): string {
  return String(requiredNumber(value, 'capacity'))
}

function formatTemperature(value: unknown): string {
  const formatted = formatDecimal(value, 'Temperature')
  return formatted.startsWith('-') ? formatted : `+${formatted}`
}

function formatTankId(value: unknown): string {
  const text = requiredText(value, 'Tank_ID')
  if (/^\d+$/.test(text)) return String(Number.parseInt(text, 10))
  return text
}

export function buildTanzaniaTankInventoriesRequest(
  rows: TanzaniaAtgSnapshotRow[],
): TanzaniaTankInventoriesRequest {
  if (!rows.length) {
    throw new Error('Tanzania ATG payload requires at least one tank snapshot')
  }

  return {
    data: rows.map((row) => ({
      product_name: requiredText(row.product_name, 'product_name'),
      tank_name: requiredText(row.tank_name, 'tank_name'),
      capacity: formatCapacity(row.capacity_litres),
      Temperature: formatTemperature(row.temperature_c),
      TC_Volume: formatDecimal(row.tc_volume_litres, 'TC_Volume'),
      Volume: formatDecimal(row.volume_litres, 'Volume'),
      Tank_ID: formatTankId(row.doms_tank_id ?? row.tg_id),
    })),
  }
}

function normalizeGaugeId(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const normalized = raw.padStart(2, '0')
  return normalized === '00' ? null : normalized
}

async function loadSnapshotsForCapture(
  stationId: string,
  recordedAt: string,
): Promise<TanzaniaAtgSnapshotRow[]> {
  return await queryAll<TanzaniaAtgSnapshotRow>(
    `SELECT product_name,
            tank_name,
            capacity_litres,
            temperature_c,
            tc_volume_litres,
            volume_litres,
            doms_tank_id,
            tg_id
       FROM tank_atg_snapshots
      WHERE station_id = $1::uuid
        AND captured_at = $2::timestamptz
      ORDER BY CASE
                 WHEN COALESCE(doms_tank_id, tg_id) ~ '^[0-9]+
function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function isBusinessFailure(data: unknown): boolean {
  const response = toRecord(data)
  const status = String(response.status ?? '')
    .trim()
    .toUpperCase()
  return (
    response.error === true ||
    response.success === false ||
    ['FAILED', 'ERROR', 'REJECTED'].includes(status)
  )
}

export type TanzaniaTankInventoryPublisherDeps = {
  getCountry: (stationId: string) => Promise<string | null>
  loadSnapshots: (
    stationId: string,
    recordedAt: string,
  ) => Promise<TanzaniaAtgSnapshotRow[]>
  loadTankMetadata?: (
    stationId: string,
  ) => Promise<TanzaniaTankPublicationMetadataRow[]>
  submit: (
    stationId: string,
    payload: TanzaniaTankInventoriesRequest,
    opts?: { signal?: AbortSignal; idempotencyKey?: string },
  ) => Promise<{ ok: boolean; status: number; data: unknown }>
}

const defaultPublisherDeps: TanzaniaTankInventoryPublisherDeps = {
  getCountry: getStationCountryCode,
  loadSnapshots: loadSnapshotsForCapture,
  loadTankMetadata: loadTankPublicationMetadata,
  submit: submitTanzaniaTankInventoriesToProxy,
}

export async function publishLatestTanzaniaTankInventories(
  stationId: string,
  capture: AtgSnapshotPublication,
  deps: TanzaniaTankInventoryPublisherDeps = defaultPublisherDeps,
) {
  const country = await deps.getCountry(stationId)
  if (!isTanzaniaCountry(country)) {
    return {
      skipped: true as const,
      reason: 'station_country_not_tanzania' as const,
    }
  }

  const requestedIds = new Set(
    capture.requestedTgIds.map(normalizeGaugeId).filter(Boolean),
  )
  const expectedCount =
    requestedIds.size > 0
      ? requestedIds.size
      : Number(capture.snapshotsSaved ?? 0)

  let rows: TanzaniaAtgSnapshotRow[] = []
  const freshReadings = Array.isArray(capture.publicationReadings)
    ? capture.publicationReadings
    : []

  if (freshReadings.length > 0 && deps.loadTankMetadata) {
    const metadata = await deps.loadTankMetadata(stationId)
    const metadataByGaugeId = new Map(
      metadata
        .map((row) => [normalizeGaugeId(row.doms_tank_id ?? row.tg_id), row] as const)
        .filter((entry): entry is [string, TanzaniaTankPublicationMetadataRow] =>
          Boolean(entry[0]),
        ),
    )
    const readingByGaugeId = new Map(
      freshReadings
        .map((reading) => [normalizeGaugeId(reading.tgId), reading] as const)
        .filter((entry): entry is [string, AtgPublicationReading] =>
          Boolean(entry[0]),
        ),
    )

    const orderedIds =
      requestedIds.size > 0
        ? Array.from(requestedIds)
        : Array.from(readingByGaugeId.keys())

    rows = orderedIds.map((tgId) => {
      const reading = readingByGaugeId.get(tgId)
      const tank = metadataByGaugeId.get(tgId)
      if (!reading || !tank) {
        throw new Error(
          `Tanzania ATG publishing requires fresh controller data and tank metadata for gauge ${tgId}.`,
        )
      }

      const configuredCapacity = Number(tank.capacity_litres)
      const capacity =
        Number.isFinite(configuredCapacity) && configuredCapacity > 0
          ? configuredCapacity
          : Number(reading.shellCapacityLitres) > 0
            ? reading.shellCapacityLitres
            : reading.maxSafeFillCapacityLitres

      return {
        product_name: tank.product_name,
        tank_name: tank.tank_name,
        capacity_litres: capacity ?? null,
        temperature_c: reading.temperatureC,
        tc_volume_litres: reading.tcVolumeLitres,
        volume_litres: reading.volumeLitres,
        doms_tank_id: tank.doms_tank_id ?? reading.domsTankId ?? tgId,
        tg_id: tgId,
      }
    })
  } else {
    rows = await deps.loadSnapshots(stationId, capture.recordedAt)
  }

  if (expectedCount <= 0 || rows.length !== expectedCount) {
    throw new Error(
      `Tanzania ATG publishing requires a complete current capture: expected ${expectedCount} tank(s), found ${rows.length} for ${capture.recordedAt}.`,
    )
  }

  const payload = buildTanzaniaTankInventoriesRequest(rows)
  const response = await deps.submit(stationId, payload, {
    idempotencyKey: `${stationId}:tanzania-tank-inventories:${capture.recordedAt}`,
  })

  if (!response.ok || isBusinessFailure(response.data)) {
    throw new Error(
      `Tanzania tank inventory rejected: ${response.status} ${JSON.stringify(response.data)}`,
    )
  }

  return {
    ok: true as const,
    tankCount: payload.data.length,
    queued: toRecord(response.data).queued === true,
  }
}

                   THEN COALESCE(doms_tank_id, tg_id)::integer
                 ELSE 2147483647
               END,
               COALESCE(doms_tank_id, tg_id),
               tank_name`,
    [stationId, recordedAt],
  )
}

async function loadTankPublicationMetadata(
  stationId: string,
): Promise<TanzaniaTankPublicationMetadataRow[]> {
  return await queryAll<TanzaniaTankPublicationMetadataRow>(
    `SELECT p.product_name,
            t.name AS tank_name,
            t.capacity_litres,
            t.doms_tank_id,
            COALESCE(NULLIF(t.doms_tank_id, ''), NULLIF(t.code, '')) AS tg_id
       FROM tanks t
  LEFT JOIN products p
         ON p.id = t.product_id
        AND p.station_id = t.station_id
      WHERE t.station_id = $1::uuid
      ORDER BY t.name ASC, t.code ASC`,
    [stationId],
  )
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function isBusinessFailure(data: unknown): boolean {
  const response = toRecord(data)
  const status = String(response.status ?? '')
    .trim()
    .toUpperCase()
  return (
    response.error === true ||
    response.success === false ||
    ['FAILED', 'ERROR', 'REJECTED'].includes(status)
  )
}

export type TanzaniaTankInventoryPublisherDeps = {
  getCountry: (stationId: string) => Promise<string | null>
  loadSnapshots: (
    stationId: string,
    recordedAt: string,
  ) => Promise<TanzaniaAtgSnapshotRow[]>
  submit: (
    stationId: string,
    payload: TanzaniaTankInventoriesRequest,
    opts?: { signal?: AbortSignal; idempotencyKey?: string },
  ) => Promise<{ ok: boolean; status: number; data: unknown }>
}

const defaultPublisherDeps: TanzaniaTankInventoryPublisherDeps = {
  getCountry: getStationCountryCode,
  loadSnapshots: loadSnapshotsForCapture,
  submit: submitTanzaniaTankInventoriesToProxy,
}

export async function publishLatestTanzaniaTankInventories(
  stationId: string,
  capture: AtgSnapshotPublication,
  deps: TanzaniaTankInventoryPublisherDeps = defaultPublisherDeps,
) {
  const country = await deps.getCountry(stationId)
  if (!isTanzaniaCountry(country)) {
    return {
      skipped: true as const,
      reason: 'station_country_not_tanzania' as const,
    }
  }

  const rows = await deps.loadSnapshots(stationId, capture.recordedAt)
  const requestedIds = new Set(
    capture.requestedTgIds.map(normalizeGaugeId).filter(Boolean),
  )
  const expectedCount =
    requestedIds.size > 0
      ? requestedIds.size
      : Number(capture.snapshotsSaved ?? 0)

  if (expectedCount <= 0 || rows.length !== expectedCount) {
    throw new Error(
      `Tanzania ATG publishing requires a complete current snapshot: expected ${expectedCount} tank(s), found ${rows.length} for ${capture.recordedAt}.`,
    )
  }

  const payload = buildTanzaniaTankInventoriesRequest(rows)
  const response = await deps.submit(stationId, payload, {
    idempotencyKey: `${stationId}:tanzania-tank-inventories:${capture.recordedAt}`,
  })

  if (!response.ok || isBusinessFailure(response.data)) {
    throw new Error(
      `Tanzania tank inventory rejected: ${response.status} ${JSON.stringify(response.data)}`,
    )
  }

  return {
    ok: true as const,
    tankCount: payload.data.length,
    queued: toRecord(response.data).queued === true,
  }
}

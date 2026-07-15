import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { getSystemConfiguration } from '@/src/shared/config/loader'
import { toBoolean, toNumberStrict as toNumber } from '@/src/shared/numbers'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { pickString } from '@/src/shared/strings'
import { uuidv4 } from '@/src/shared/utils/uuid'

import type {
  ForecourtNozzle,
  ForecourtProduct,
  ForecourtPump,
  ForecourtSnapshot,
  ForecourtSyncResult,
  ForecourtTank,
} from './types'
import {
  buildXmlRecord,
  collectArraysByKeys,
  firstArrayAtPaths,
  parseXmlElements,
} from './utils'

const DEFAULT_TAX_RATE = 16
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY?.trim() || 'USD'
const PRODUCT_CLASS_CODE = '9901300102'
const PRODUCT_TYPE_CODE = '2'

const LOCK_KEY = 'forecourt.sync.lock'
const STATUS_KEY = 'forecourt.sync.status'
const TANK_STATUS_KEY = 'forecourt.tankStatus'

export type ForecourtSyncConfig = {
  enabled: boolean
  source: 'jpl' | 'file'
  snapshotFormat?: 'json' | 'dps-xml'
  snapshotPath?: string
  snapshotMethod?: 'GET' | 'POST'
  snapshotBody?: Record<string, unknown> | null
  snapshotFile?: string
  tankStatusPath?: string
  tankStatusMethod?: 'GET' | 'POST'
  minIntervalMs: number
  defaults?: {
    currency?: string
    taxRate?: number
    unitCost?: number
  }
}

type ForecourtSyncStatus = {
  ok: boolean
  lastSyncAt?: string
  lastSyncMs?: number
  lastError?: string
  counts?: ForecourtSyncResult['counts']
  source?: string
}

export async function getForecourtSyncConfig(
  stationId: string,
): Promise<ForecourtSyncConfig | null> {
  const cfg = await getSystemConfiguration(stationId)
  const jpl = (cfg as any)?.integrations?.jpl
  if (!jpl) return null

  const raw = (jpl as any)?.forecourtSync ?? (jpl as any)?.forecourt ?? {}
  const enabled = raw?.enabled !== false
  const source = String(raw?.source ?? 'jpl').toLowerCase()

  return {
    enabled,
    source: source === 'file' ? 'file' : 'jpl',
    snapshotFormat:
      String(raw?.snapshotFormat ?? '')
        .trim()
        .toLowerCase() === 'dps-xml'
        ? 'dps-xml'
        : undefined,
    snapshotPath: raw?.snapshotPath
      ? String(raw.snapshotPath).trim()
      : undefined,
    snapshotMethod: raw?.snapshotMethod
      ? String(raw.snapshotMethod).trim().toUpperCase() === 'GET'
        ? 'GET'
        : 'POST'
      : 'POST',
    snapshotBody: raw?.snapshotBody ?? null,
    snapshotFile: raw?.snapshotFile
      ? String(raw.snapshotFile).trim()
      : undefined,
    tankStatusPath: raw?.tankStatusPath
      ? String(raw.tankStatusPath).trim()
      : undefined,
    tankStatusMethod: raw?.tankStatusMethod
      ? String(raw.tankStatusMethod).trim().toUpperCase() === 'GET'
        ? 'GET'
        : 'POST'
      : 'GET',
    minIntervalMs: Math.max(60_000, Number(raw?.minIntervalMs ?? 15 * 60_000)),
    defaults: {
      currency: raw?.defaults?.currency
        ? String(raw.defaults.currency)
        : undefined,
      taxRate:
        raw?.defaults?.taxRate != null
          ? Number(raw.defaults.taxRate)
          : undefined,
      unitCost:
        raw?.defaults?.unitCost != null
          ? Number(raw.defaults.unitCost)
          : undefined,
    },
  }
}

const normalizeProduct = (item: any): ForecourtProduct | null => {
  const productId = pickString(
    item?.productId,
    item?.product_id,
    item?.id,
    item?.gradeId,
    item?.grade_id,
    item?.code,
    item?.gradeCode,
  )
  const productCode = pickString(
    item?.productCode,
    item?.product_code,
    item?.code,
    item?.gradeCode,
    productId,
  )
  const productName = pickString(
    item?.productName,
    item?.product_name,
    item?.name,
    item?.gradeName,
    productCode,
  )

  if (!productId || !productCode || !productName) return null

  return {
    productId,
    productCode,
    productName,
    unitPrice:
      toNumber(item?.unitPrice ?? item?.price ?? item?.unit_price) ?? undefined,
    unitCost: toNumber(item?.unitCost ?? item?.unit_cost) ?? undefined,
    currency: pickString(
      item?.currency,
      item?.currencyCode,
      item?.currency_code,
    ),
    taxRate: toNumber(item?.taxRate ?? item?.tax_rate) ?? undefined,
    productClassCode: pickString(item?.productClassCode, item?.classCode),
    productTypeCode: pickString(item?.productTypeCode, item?.typeCode),
    category: pickString(item?.category),
    unitOfMeasure: pickString(item?.unitOfMeasure, item?.uom),
  }
}

const normalizeTank = (item: any): ForecourtTank | null => {
  const tankNumber =
    toNumber(item?.tankNumber ?? item?.tank_number ?? item?.number) ??
    (typeof item?.id === 'number' ? item.id : null)
  const tankCode = pickString(
    item?.tankCode,
    item?.tank_code,
    item?.code,
    tankNumber != null ? `TANK-${tankNumber}` : '',
  )
  const tankName = pickString(item?.tankName, item?.name, tankCode)
  const productId = pickString(
    item?.productId,
    item?.product_id,
    item?.gradeId,
    item?.grade_id,
    item?.productCode,
    item?.gradeCode,
  )

  if (!productId || (!tankCode && tankNumber == null)) return null

  return {
    tankNumber: tankNumber ?? undefined,
    tankCode: tankCode || undefined,
    tankName: tankName || undefined,
    productId,
    capacityLitres:
      toNumber(
        item?.capacityLitres ?? item?.capacity_litres ?? item?.capacity,
      ) ?? undefined,
    lowLevelLitres:
      toNumber(item?.lowLevelLitres ?? item?.low_level_litres) ?? null,
    criticalLevelLitres:
      toNumber(item?.criticalLevelLitres ?? item?.critical_level_litres) ??
      null,
    status: pickString(item?.status),
  }
}

const normalizePump = (item: any): ForecourtPump | null => {
  const pumpNumber =
    toNumber(item?.pumpNumber ?? item?.pump_number ?? item?.number) ??
    (typeof item?.id === 'number' ? item.id : null)
  if (!pumpNumber || !Number.isFinite(pumpNumber)) return null

  const pumpCode = pickString(
    item?.pumpCode,
    item?.pump_code,
    item?.code,
    `FP-${pumpNumber}`,
  )
  const pumpName = pickString(item?.pumpName, item?.name, pumpCode)

  return {
    pumpNumber,
    pumpCode: pumpCode || undefined,
    pumpName: pumpName || undefined,
    hasNozzleSelector: toBoolean(
      item?.hasNozzleSelector ?? item?.nozzleSelector ?? item?.multiNozzle,
    ),
    status: pickString(item?.status),
  }
}

const normalizeNozzle = (item: any): ForecourtNozzle | null => {
  const pumpNumber =
    toNumber(
      item?.pumpNumber ??
        item?.pump_number ??
        item?.fpNumber ??
        item?.fp_number ??
        item?.fuellingPointNumber ??
        item?.fuelingPointNumber ??
        item?.dispenserNumber,
    ) ?? (typeof item?.pumpId === 'number' ? item.pumpId : null)
  const nozzleNumber =
    toNumber(
      item?.nozzleNumber ??
        item?.nozzle_number ??
        item?.number ??
        item?.gradeOptionNumber ??
        item?.gradeOptionNo ??
        item?.hoseNumber ??
        item?.hoseNo,
    ) ?? (typeof item?.id === 'number' ? item.id : null)

  if (!pumpNumber || !nozzleNumber) return null

  const tankNumber = toNumber(item?.tankNumber ?? item?.tank_number) ?? null
  const tankCode = pickString(
    item?.tankCode,
    item?.tank_code,
    item?.tankId,
    tankNumber != null ? `TANK-${tankNumber}` : '',
  )
  const productId = pickString(item?.productId, item?.product_id)
  const productCode = pickString(
    item?.productCode,
    item?.product_code,
    item?.gradeCode,
    item?.grade_code,
    item?.gradeId,
    item?.grade_id,
  )

  return {
    pumpNumber,
    nozzleNumber,
    tankNumber: tankNumber ?? undefined,
    tankCode: tankCode || undefined,
    productId: productId || productCode || undefined,
  }
}

const deriveNozzlesFromPumps = (pumpsRaw: any[]): ForecourtNozzle[] => {
  const out: ForecourtNozzle[] = []

  for (const pumpItem of pumpsRaw) {
    const pump = normalizePump(pumpItem)
    if (!pump) continue

    const nested =
      firstArrayAtPaths(pumpItem, [
        'nozzles',
        'hoses',
        'gradeOptions',
        'grade_options',
        'grades',
      ]) || []

    for (const nozzleItem of nested) {
      const normalized = normalizeNozzle({
        pumpNumber: pump.pumpNumber,
        ...nozzleItem,
      })
      if (normalized) out.push(normalized)
    }
  }

  return out
}

function normalizeSnapshot(payload: any, source: string): ForecourtSnapshot {
  const productsRaw =
    firstArrayAtPaths(payload, [
      'products',
      'grades',
      'fuelProducts',
      'items',
      'data.products',
      'data.grades',
      'result.products',
      'result.grades',
      'payload.products',
      'payload.grades',
      'siteStatus.products',
      'siteStatus.grades',
      'SiteStatus.Products',
      'SiteStatus.Grades',
    ]) ||
    collectArraysByKeys(payload, [
      'products',
      'grades',
      'fuelProducts',
      'items',
    ])[0] ||
    []

  const tanksRaw =
    firstArrayAtPaths(payload, [
      'tanks',
      'tankList',
      'devices.tanks',
      'Devices.Tanks',
      'data.tanks',
      'result.tanks',
      'payload.tanks',
      'siteStatus.tanks',
      'SiteStatus.Tanks',
    ]) ||
    collectArraysByKeys(payload, ['tanks', 'tankList', 'storageTanks'])[0] ||
    []

  const pumpsRaw =
    firstArrayAtPaths(payload, [
      'pumps',
      'dispensers',
      'fps',
      'fuellingPoints',
      'fuelingPoints',
      'devices.fuellingPoints',
      'devices.fuelingPoints',
      'Devices.FuellingPoints',
      'Devices.FuelingPoints',
      'data.pumps',
      'result.pumps',
      'payload.pumps',
      'siteStatus.pumps',
      'SiteStatus.Pumps',
    ]) ||
    collectArraysByKeys(payload, [
      'pumps',
      'dispensers',
      'fps',
      'fuellingPoints',
      'fuelingPoints',
    ])[0] ||
    []

  const nozzlesRaw =
    firstArrayAtPaths(payload, [
      'nozzles',
      'hoses',
      'fpNozzles',
      'data.nozzles',
      'result.nozzles',
      'payload.nozzles',
      'siteStatus.nozzles',
      'SiteStatus.Nozzles',
    ]) ||
    collectArraysByKeys(payload, ['nozzles', 'hoses', 'fpNozzles'])[0] ||
    []

  const products = productsRaw
    .map(normalizeProduct)
    .filter((p): p is ForecourtProduct => Boolean(p))
  const tanks = tanksRaw
    .map(normalizeTank)
    .filter((t): t is ForecourtTank => Boolean(t))
  const pumps = pumpsRaw
    .map(normalizePump)
    .filter((p): p is ForecourtPump => Boolean(p))
  const nozzles = nozzlesRaw
    .map(normalizeNozzle)
    .filter((n): n is ForecourtNozzle => Boolean(n))

  if (!nozzles.length && pumpsRaw.length) {
    nozzles.push(...deriveNozzlesFromPumps(pumpsRaw))
  }

  return {
    source,
    fetchedAt: new Date().toISOString(),
    products,
    tanks,
    pumps,
    nozzles,
  }
}

const parseDpsSiteStatusXml = (
  xml: string,
  source: string,
): ForecourtSnapshot => {
  const productTags = ['product', 'grade', 'fuelproduct', 'item']
  const tankTags = ['tank', 'tg']
  const pumpTags = ['pump', 'dispenser', 'fp', 'fuellingPoint', 'fuelingPoint']
  const nozzleTags = ['nozzle', 'hose', 'gradeOption']

  const productChildTags = [
    'productId',
    'product_id',
    'gradeId',
    'grade_id',
    'id',
    'code',
    'productCode',
    'product_name',
    'productName',
    'name',
    'gradeCode',
    'gradeName',
    'price',
    'unitPrice',
    'unit_cost',
    'unitCost',
    'currency',
    'currencyCode',
    'taxRate',
    'tax_rate',
    'category',
    'unitOfMeasure',
    'uom',
    'productClassCode',
    'productTypeCode',
    'classCode',
    'typeCode',
  ]

  const tankChildTags = [
    'tankNumber',
    'tank_number',
    'tankCode',
    'tank_code',
    'name',
    'tankName',
    'productId',
    'product_id',
    'gradeId',
    'grade_id',
    'capacity',
    'capacityLitres',
    'capacity_litres',
    'lowLevelLitres',
    'low_level_litres',
    'criticalLevelLitres',
    'critical_level_litres',
    'status',
  ]

  const pumpChildTags = [
    'pumpNumber',
    'pump_number',
    'number',
    'pumpCode',
    'pump_code',
    'code',
    'pumpName',
    'name',
    'hasNozzleSelector',
    'nozzleSelector',
    'multiNozzle',
    'status',
    'fuellingPointNumber',
    'fuelingPointNumber',
  ]

  const nozzleChildTags = [
    'pumpNumber',
    'pump_number',
    'nozzleNumber',
    'nozzle_number',
    'number',
    'tankNumber',
    'tank_number',
    'tankCode',
    'tank_code',
    'productId',
    'product_id',
    'gradeOptionNo',
    'gradeOptionNumber',
    'gradeId',
    'grade_id',
    'gradeCode',
    'grade_code',
    'hoseNo',
    'hoseNumber',
  ]

  const products = productTags
    .flatMap((tag) => parseXmlElements(xml, tag))
    .map((element) =>
      normalizeProduct(buildXmlRecord(element, productChildTags)),
    )
    .filter((item): item is ForecourtProduct => Boolean(item))

  const tanks = tankTags
    .flatMap((tag) => parseXmlElements(xml, tag))
    .map((element) => normalizeTank(buildXmlRecord(element, tankChildTags)))
    .filter((item): item is ForecourtTank => Boolean(item))

  const pumps: ForecourtPump[] = []
  const nozzleCandidates: ForecourtNozzle[] = []

  for (const tag of pumpTags) {
    for (const element of parseXmlElements(xml, tag)) {
      const pumpRecord = buildXmlRecord(element, pumpChildTags)
      const pump = normalizePump(pumpRecord)
      if (pump) pumps.push(pump)

      for (const nozzleTag of nozzleTags) {
        for (const nozzleEl of parseXmlElements(element.inner, nozzleTag)) {
          const nozzleRecord = buildXmlRecord(nozzleEl, nozzleChildTags)
          if (pump?.pumpNumber != null) {
            nozzleRecord.pumpNumber = nozzleRecord.pumpNumber ?? pump.pumpNumber
            nozzleRecord.pump_number =
              nozzleRecord.pump_number ?? pump.pumpNumber
          }
          const nozzle = normalizeNozzle(nozzleRecord)
          if (nozzle) nozzleCandidates.push(nozzle)
        }
      }
    }
  }

  for (const nozzleTag of nozzleTags) {
    for (const element of parseXmlElements(xml, nozzleTag)) {
      const nozzle = normalizeNozzle(buildXmlRecord(element, nozzleChildTags))
      if (nozzle) nozzleCandidates.push(nozzle)
    }
  }

  const nozzleMap = new Map<string, ForecourtNozzle>()
  for (const nozzle of nozzleCandidates) {
    const key = `${nozzle.pumpNumber}:${nozzle.nozzleNumber}`
    if (!nozzleMap.has(key)) nozzleMap.set(key, nozzle)
  }

  return {
    source,
    fetchedAt: new Date().toISOString(),
    products,
    tanks,
    pumps,
    nozzles: Array.from(nozzleMap.values()),
  }
}

async function acquireLock(
  stationId: string,
  force?: boolean,
): Promise<boolean> {
  const lock = await kvGet<{ lockedAt: string }>(stationId, LOCK_KEY)
  const now = Date.now()
  const lockedAt = lock?.lockedAt ? Date.parse(lock.lockedAt) : 0
  const expired = !lockedAt || now - lockedAt > 15 * 60_000

  if (!force && lock && !expired) return false

  await kvSet(stationId, LOCK_KEY, { lockedAt: new Date().toISOString() })
  return true
}

async function releaseLock(stationId: string) {
  await kvSet(stationId, LOCK_KEY, { lockedAt: null })
}

async function shouldRun(
  stationId: string,
  minIntervalMs: number,
): Promise<boolean> {
  const status = await kvGet<ForecourtSyncStatus>(stationId, STATUS_KEY)
  if (!status?.lastSyncAt) return true
  const last = Date.parse(status.lastSyncAt)
  if (!Number.isFinite(last)) return true
  return Date.now() - last >= minIntervalMs
}

async function applySnapshot(
  stationId: string,
  snapshot: ForecourtSnapshot,
  defaults: ForecourtSyncConfig['defaults'],
) {
  const defaultCurrency =
    defaults?.currency && defaults.currency.trim()
      ? defaults.currency.trim()
      : DEFAULT_CURRENCY
  const defaultTaxRate =
    defaults?.taxRate != null ? defaults.taxRate : DEFAULT_TAX_RATE
  const defaultUnitCost = defaults?.unitCost != null ? defaults.unitCost : 0

  return await withTransaction(async (client) => {
    const productIdMap = new Map<string, string>()

    for (const product of snapshot.products) {
      const row = await txQuery<{ id: string; product_id: string }>(
        client,
        `INSERT INTO products (
          id, station_id, product_id, product_code, product_name,
          product_class_code, product_type_code, unit_price, unit_cost,
          currency, tax_rate, category, unit_of_measure, created_by_name,
          is_online, last_sync_status, last_sync_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17
        ) ON CONFLICT (station_id, product_id) DO UPDATE SET
          product_code = EXCLUDED.product_code,
          product_name = EXCLUDED.product_name,
          product_class_code = EXCLUDED.product_class_code,
          product_type_code = EXCLUDED.product_type_code,
          unit_price = EXCLUDED.unit_price,
          unit_cost = EXCLUDED.unit_cost,
          currency = EXCLUDED.currency,
          tax_rate = EXCLUDED.tax_rate,
          category = EXCLUDED.category,
          unit_of_measure = EXCLUDED.unit_of_measure,
          last_sync_status = EXCLUDED.last_sync_status,
          last_sync_at = EXCLUDED.last_sync_at,
          updated_at = NOW()
        RETURNING id, product_id`,
        [
          uuidv4(),
          stationId,
          product.productId,
          product.productCode,
          product.productName,
          product.productClassCode || PRODUCT_CLASS_CODE,
          product.productTypeCode || PRODUCT_TYPE_CODE,
          product.unitPrice ?? 0,
          product.unitCost ?? defaultUnitCost,
          product.currency || defaultCurrency,
          product.taxRate ?? defaultTaxRate,
          product.category ?? null,
          product.unitOfMeasure ?? null,
          'DOMS',
          false,
          'SYNCED',
          new Date().toISOString(),
        ],
      )
      const result = row.rows[0]
      if (result?.product_id && result?.id) {
        productIdMap.set(String(result.product_id), String(result.id))
      }
    }

    const tankIdMap = new Map<string, string>()

    for (const tank of snapshot.tanks) {
      const code =
        tank.tankCode ||
        (tank.tankNumber != null ? `TANK-${tank.tankNumber}` : '')
      if (!code) continue

      const productRef = productIdMap.get(tank.productId)
      if (!productRef) continue

      const row = await txQuery<{ id: string; code: string }>(
        client,
        `INSERT INTO tanks (
          id, station_id, code, name, product_id, capacity_litres,
          status, low_level_litres, critical_level_litres
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9
        ) ON CONFLICT (station_id, code) DO UPDATE SET
          name = EXCLUDED.name,
          product_id = EXCLUDED.product_id,
          capacity_litres = EXCLUDED.capacity_litres,
          status = EXCLUDED.status,
          low_level_litres = EXCLUDED.low_level_litres,
          critical_level_litres = EXCLUDED.critical_level_litres,
          updated_at = NOW()
        RETURNING id, code`,
        [
          uuidv4(),
          stationId,
          code,
          tank.tankName || code,
          productRef,
          tank.capacityLitres ?? 0,
          (tank.status || 'ACTIVE').toUpperCase(),
          tank.lowLevelLitres ?? null,
          tank.criticalLevelLitres ?? null,
        ],
      )
      const result = row.rows[0]
      if (result?.code && result?.id) {
        tankIdMap.set(String(result.code), String(result.id))
      }
    }

    const pumpIdMap = new Map<number, string>()

    for (const pump of snapshot.pumps) {
      const code = pump.pumpCode || `FP-${pump.pumpNumber}`
      const row = await txQuery<{ id: string; pump_number: number }>(
        client,
        `INSERT INTO pumps (
          id, station_id, code, name, status, has_nozzle_selector, pump_number
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        ) ON CONFLICT (station_id, code) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          has_nozzle_selector = EXCLUDED.has_nozzle_selector,
          pump_number = EXCLUDED.pump_number,
          updated_at = NOW()
        RETURNING id, pump_number`,
        [
          uuidv4(),
          stationId,
          code,
          pump.pumpName || code,
          (pump.status || 'ACTIVE').toUpperCase(),
          Boolean(pump.hasNozzleSelector),
          pump.pumpNumber,
        ],
      )
      const result = row.rows[0]
      if (result?.pump_number && result?.id) {
        pumpIdMap.set(Number(result.pump_number), String(result.id))
      }
    }

    const desiredNozzles = new Set<string>()

    for (const nozzle of snapshot.nozzles) {
      const pumpId = pumpIdMap.get(nozzle.pumpNumber)
      if (!pumpId) continue

      const tankCode =
        nozzle.tankCode ||
        (nozzle.tankNumber != null ? `TANK-${nozzle.tankNumber}` : '')
      const tankId = tankCode ? tankIdMap.get(tankCode) : undefined
      if (!tankId) continue

      await txQuery(
        client,
        `INSERT INTO nozzles (id, station_id, pump_id, tank_id, nozzle_number)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pump_id, nozzle_number) DO UPDATE SET
           tank_id = EXCLUDED.tank_id,
           updated_at = NOW()`,
        [uuidv4(), stationId, pumpId, tankId, nozzle.nozzleNumber],
      )
      desiredNozzles.add(`${pumpId}:${nozzle.nozzleNumber}`)
    }

    if (snapshot.nozzles.length > 0) {
      const existingNozzles = await txQuery<{
        id: string
        pump_id: string
        nozzle_number: number
      }>(
        client,
        `SELECT id, pump_id, nozzle_number
           FROM nozzles
          WHERE station_id = $1`,
        [stationId],
      )

      const nozzlesToDelete = existingNozzles.rows
        .filter(
          (row) => !desiredNozzles.has(`${row.pump_id}:${row.nozzle_number}`),
        )
        .map((row) => row.id)

      if (nozzlesToDelete.length) {
        await txQuery(
          client,
          `DELETE FROM nozzles WHERE station_id = $1 AND id = ANY($2::uuid[])`,
          [stationId, nozzlesToDelete],
        )
      }
    }

    if (snapshot.pumps.length > 0) {
      const existingPumps = await txQuery<{ id: string; pump_number: number }>(
        client,
        `SELECT id, pump_number FROM pumps WHERE station_id = $1`,
        [stationId],
      )

      const pumpNumbers = new Set(snapshot.pumps.map((p) => p.pumpNumber))
      const pumpsToDelete = existingPumps.rows
        .filter((row) => !pumpNumbers.has(Number(row.pump_number)))
        .map((row) => row.id)

      if (pumpsToDelete.length) {
        await txQuery(
          client,
          `DELETE FROM nozzles WHERE station_id = $1 AND pump_id = ANY($2::uuid[])`,
          [stationId, pumpsToDelete],
        )
        await txQuery(
          client,
          `DELETE FROM pumps WHERE station_id = $1 AND id = ANY($2::uuid[])`,
          [stationId, pumpsToDelete],
        )
      }
    }

    if (snapshot.tanks.length > 0) {
      const existingTanks = await txQuery<{ id: string; code: string }>(
        client,
        `SELECT id, code FROM tanks WHERE station_id = $1`,
        [stationId],
      )

      const tankCodes = new Set(
        snapshot.tanks
          .map(
            (t) =>
              t.tankCode ||
              (t.tankNumber != null ? `TANK-${t.tankNumber}` : ''),
          )
          .filter(Boolean),
      )
      const tanksToDelete = existingTanks.rows
        .filter((row) => !tankCodes.has(String(row.code)))
        .map((row) => row.id)

      if (tanksToDelete.length) {
        await txQuery(
          client,
          `DELETE FROM nozzles WHERE station_id = $1 AND tank_id = ANY($2::uuid[])`,
          [stationId, tanksToDelete],
        )
        await txQuery(
          client,
          `DELETE FROM tanks WHERE station_id = $1 AND id = ANY($2::uuid[])`,
          [stationId, tanksToDelete],
        )
      }
    }

    return {
      products: snapshot.products.length,
      tanks: snapshot.tanks.length,
      pumps: snapshot.pumps.length,
      nozzles: snapshot.nozzles.length,
    }
  })
}

export async function refreshTankStatus(
  stationId: string,
  payload: any,
): Promise<void> {
  await kvSet(stationId, TANK_STATUS_KEY, {
    fetchedAt: new Date().toISOString(),
    payload,
  })
}

export async function runForecourtConfigSync(params: {
  stationId: string
  force?: boolean
  includeTankStatus?: boolean
}): Promise<ForecourtSyncResult> {
  const startedAt = Date.now()
  const cfg = await getForecourtSyncConfig(params.stationId)
  if (!cfg || !cfg.enabled) {
    return { ok: false, error: 'Forecourt sync is disabled' }
  }

  if (
    !params.force &&
    !(await shouldRun(params.stationId, cfg.minIntervalMs))
  ) {
    return {
      ok: true,
      source: cfg.source,
      counts: { products: 0, tanks: 0, pumps: 0, nozzles: 0 },
    }
  }

  const locked = await acquireLock(params.stationId, params.force)
  if (!locked) {
    return { ok: false, error: 'Forecourt sync already in progress' }
  }

  try {
    if (cfg.source === 'file' && !cfg.snapshotFile) {
      throw new Error('Forecourt snapshotFile is required for file source')
    }

    const {
      readSnapshotFromDomsJson,
      readSnapshotFromDomsXml,
      readSnapshotFromFile,
      readTankStatusFromDoms,
      resolveSnapshotFormat,
    } = await import('./io')

    const snapshotFormat = resolveSnapshotFormat(
      cfg,
      cfg.source === 'file' ? cfg.snapshotFile : cfg.snapshotPath,
    )

    const rawPayload =
      cfg.source === 'file'
        ? await readSnapshotFromFile(cfg.snapshotFile as string, snapshotFormat)
        : snapshotFormat === 'dps-xml'
          ? await readSnapshotFromDomsXml(params.stationId, cfg)
          : await readSnapshotFromDomsJson(params.stationId, cfg)

    const source =
      snapshotFormat === 'dps-xml' ? `${cfg.source}-xml` : cfg.source
    const snapshot =
      snapshotFormat === 'dps-xml'
        ? parseDpsSiteStatusXml(String(rawPayload ?? ''), source)
        : normalizeSnapshot(rawPayload, source)
    const counts = await applySnapshot(params.stationId, snapshot, cfg.defaults)

    const status: ForecourtSyncStatus = {
      ok: true,
      lastSyncAt: new Date().toISOString(),
      lastSyncMs: Date.now() - startedAt,
      counts,
      source: cfg.source,
    }
    await kvSet(params.stationId, STATUS_KEY, status)

    if (params.includeTankStatus) {
      const tankStatus = await readTankStatusFromDoms(params.stationId, cfg)
      if (tankStatus) {
        await refreshTankStatus(params.stationId, tankStatus)
      }
    }

    return {
      ok: true,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      counts,
    }
  } catch (err: any) {
    const status: ForecourtSyncStatus = {
      ok: false,
      lastSyncAt: new Date().toISOString(),
      lastSyncMs: Date.now() - startedAt,
      lastError: err?.message || String(err),
      source: cfg.source,
    }
    await kvSet(params.stationId, STATUS_KEY, status)
    return { ok: false, error: status.lastError }
  } finally {
    await releaseLock(params.stationId)
  }
}

export async function getForecourtSyncStatus(
  stationId: string,
): Promise<ForecourtSyncStatus | null> {
  return await kvGet<ForecourtSyncStatus>(stationId, STATUS_KEY)
}

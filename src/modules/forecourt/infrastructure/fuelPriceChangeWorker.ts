import type { FuelPriceChangeDto } from '@/src/shared/proxy/client'

import { query } from '@/src/platform/db/postgres'
import { getFuelPriceChangesViaProxy } from '@/src/shared/proxy/client'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { localDateTime } from '@/src/shared/time/localDateTime'
import { resolveStationTimezone } from '@/src/shared/time/localTimezone'
import { logger } from '@/src/shared/utils/logger'

import { pumpMappingsRepo } from '@/src/modules/forecourt/infrastructure/repositories/pumpMappingsRepo'
import { executePosDomsCommand } from '@/src/modules/pos/application/executePosDomsCommand'

const WORKER_NAME = 'fuelPriceChangeWorker'
const DEFAULT_POLL_MS = 60 * 60_000
const MIN_POLL_MS = 60_000

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

const appliedKey = (changeId: number) => `fuelPriceChange.applied.${changeId}`

export function resolveDomsGradeIdFromRows(
  rows: Awaited<ReturnType<typeof pumpMappingsRepo.listRowsByStationId>>,
  change: FuelPriceChangeDto,
): string {
  const productCode = normalize(change.productCode)
  const productId = normalize(change.productId)

  const matches = rows.filter((row) => {
    if (productCode) {
      return [row.product_code, row.ext_product_code].some(
        (value) => normalize(value) === productCode,
      )
    }

    return Boolean(productId) && normalize(row.ext_product_id) === productId
  })

  const gradeIds = Array.from(
    new Set(
      matches
        .map((row) => String(row.doms_grade_id ?? '').trim())
        .filter(Boolean),
    ),
  )

  if (gradeIds.length === 0) {
    throw new Error(
      `No DOMS grade mapping found for fuel price change ${change.id} (productId=${change.productId ?? 'null'}, productCode=${change.productCode ?? 'null'})`,
    )
  }
  if (gradeIds.length > 1) {
    throw new Error(
      `Fuel price change ${change.id} maps to multiple DOMS grades: ${gradeIds.join(', ')}`,
    )
  }

  return gradeIds[0]
}

async function resolveDomsGradeId(
  stationId: string,
  change: FuelPriceChangeDto,
): Promise<string> {
  const rows = await pumpMappingsRepo.listRowsByStationId(stationId)
  return resolveDomsGradeIdFromRows(rows, change)
}

export function buildDomsPriceChangePayload(
  change: FuelPriceChangeDto,
  gradeId: string,
  timezone: string,
  now: Date = new Date(),
): Record<string, unknown> {
  const newPrice = Number(change.newPrice)
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    throw new Error(
      `Fuel price change ${change.id} has invalid newPrice=${String(change.newPrice)}`,
    )
  }

  let effectiveAtLocal: string
  try {
    effectiveAtLocal = localDateTime(
      change.effectiveAt,
      timezone,
    ).localIsoSeconds
  } catch {
    throw new Error(
      `Fuel price change ${change.id} has invalid effectiveAt=${String(change.effectiveAt)}`,
    )
  }

  const nowLocal = localDateTime(now, timezone).localIsoSeconds
  const payload: Record<string, unknown> = {
    entries: [{ gradeId, price: newPrice }],
    requestedBy: 'vpos-cloud-fuel-price-change',
  }

  if (effectiveAtLocal <= nowLocal) {
    payload.applyNow = true
  } else {
    payload.effectiveAt = effectiveAtLocal
  }

  return payload
}

async function syncLocalProductPrice(
  stationId: string,
  change: FuelPriceChangeDto,
) {
  const productCode = String(change.productCode ?? '').trim()
  if (!productCode) {
    throw new Error(
      `Fuel price change ${change.id} cannot update products.unit_price without productCode`,
    )
  }

  const result = await query(
    `UPDATE products
        SET unit_price = $3,
            updated_at = NOW()
      WHERE station_id = $1
        AND (
          UPPER(BTRIM(product_code)) = UPPER(BTRIM($2))
          OR UPPER(BTRIM(COALESCE(ext_product_code, ''))) = UPPER(BTRIM($2))
        )`,
    [stationId, productCode, Number(change.newPrice)],
  )

  if ((result.rowCount ?? 0) < 1) {
    throw new Error(
      `No local product row found for fuel price change ${change.id} productCode=${productCode}`,
    )
  }
}

function isEffectiveNow(
  change: FuelPriceChangeDto,
  timezone: string,
  now: Date = new Date(),
) {
  const effectiveAtLocal = localDateTime(
    change.effectiveAt,
    timezone,
  ).localIsoSeconds
  const nowLocal = localDateTime(now, timezone).localIsoSeconds
  return effectiveAtLocal <= nowLocal
}

async function applyFuelPriceChange(
  stationId: string,
  change: FuelPriceChangeDto,
) {
  const timezone = await resolveStationTimezone(stationId)
  const existing = await kvGet<Record<string, any>>(
    stationId,
    appliedKey(change.id),
  )
  if (existing) {
    if (!existing.localPriceSyncedAt && isEffectiveNow(change, timezone)) {
      await syncLocalProductPrice(stationId, change)
      const localPriceSyncedAt = new Date().toISOString()
      await kvSet(stationId, appliedKey(change.id), {
        ...existing,
        localPriceSyncedAt,
      })
      return {
        applied: false,
        skipped: true,
        reason: 'already_applied_local_price_synced',
      }
    }
    return { applied: false, skipped: true, reason: 'already_applied' }
  }

  const gradeId = await resolveDomsGradeId(stationId, change)
  const payload = buildDomsPriceChangePayload(change, gradeId, timezone)
  const newPrice = Number(change.newPrice)

  const result = await executePosDomsCommand(
    stationId,
    'changeGradePrices',
    payload,
  )

  if (!result.success) {
    throw new Error(
      String(
        result?.message ??
          result?.error?.message ??
          `DOMS rejected fuel price change ${change.id}`,
      ),
    )
  }

  const appliedAt = new Date().toISOString()
  const effectiveNow = isEffectiveNow(change, timezone)
  let localPriceSyncedAt: string | null = null
  if (effectiveNow) {
    await syncLocalProductPrice(stationId, change)
    localPriceSyncedAt = new Date().toISOString()
  }

  await kvSet(stationId, appliedKey(change.id), {
    changeId: change.id,
    productId: change.productId ?? null,
    productCode: change.productCode ?? null,
    gradeId,
    newPrice,
    effectiveAt: change.effectiveAt,
    appliedAt,
    localPriceSyncedAt,
  })

  return {
    applied: true,
    skipped: false,
    gradeId,
    newPrice,
    effectiveAt: change.effectiveAt,
  }
}

export async function pollFuelPriceChangesOnce(stationId: string) {
  const response = await getFuelPriceChangesViaProxy(stationId)
  if (!response.ok) {
    throw new Error(
      String(
        response.data?.message ??
          response.data?.error ??
          `vpos-proxy returned HTTP ${response.status}`,
      ),
    )
  }

  if (response.data?.error) {
    throw new Error(
      String(
        response.data.message ?? 'Fuel price change response reported an error',
      ),
    )
  }

  const changes = Array.isArray(response.data?.fuelPriceChanges)
    ? [...response.data.fuelPriceChanges]
    : []

  changes.sort((a, b) => {
    const at = String(a.effectiveAt ?? '')
    const bt = String(b.effectiveAt ?? '')
    if (at !== bt) return at.localeCompare(bt)
    return Number(a.id) - Number(b.id)
  })

  const results = []
  for (const change of changes) {
    results.push({
      changeId: change.id,
      ...(await applyFuelPriceChange(stationId, change)),
    })
  }

  return {
    fetched: changes.length,
    applied: results.filter((item) => item.applied).length,
    skipped: results.filter((item) => item.skipped).length,
    results,
  }
}

export function startFuelPriceChangeWorker(input: {
  stationId: string
  pollMs?: number
}) {
  const configured = Number(input.pollMs ?? DEFAULT_POLL_MS)
  const pollMs =
    Number.isFinite(configured) && configured >= MIN_POLL_MS
      ? configured
      : DEFAULT_POLL_MS
  let stopped = false
  let timer: NodeJS.Timeout | null = null
  let running = false

  const schedule = () => {
    if (stopped) return
    timer = setTimeout(() => {
      void tick()
    }, pollMs)
    timer.unref?.()
  }

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      const result = await pollFuelPriceChangesOnce(input.stationId)
      await upsertProcessHeartbeat({
        stationId: input.stationId,
        processName: WORKER_NAME,
        status: 'OK',
        connected: true,
        metrics: {
          pollMs,
          fetched: result.fetched,
          applied: result.applied,
          skipped: result.skipped,
          lastSuccessAt: new Date().toISOString(),
        },
        lastError: null,
      }).catch(() => {})
    } catch (error: any) {
      const message = String(error?.message || error)
      logger.error('[fuel-price-change-worker]', {
        msg: 'fuel price change poll failed',
        error: message,
      })
      await upsertProcessHeartbeat({
        stationId: input.stationId,
        processName: WORKER_NAME,
        status: 'ERROR',
        connected: false,
        metrics: {
          pollMs,
          lastAttemptAt: new Date().toISOString(),
        },
        lastError: message,
      }).catch(() => {})
    } finally {
      running = false
      schedule()
    }
  }

  void tick()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

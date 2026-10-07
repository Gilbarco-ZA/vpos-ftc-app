import type { FuelPriceChangeDto } from '@/src/shared/proxy/client'

import { query, queryAll } from '@/src/platform/db/postgres'
import { getFuelPriceChangesViaProxy } from '@/src/shared/proxy/client'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { localDateTime } from '@/src/shared/time/localDateTime'
import { resolveStationTimezone } from '@/src/shared/time/localTimezone'

import { pumpMappingsRepo } from '@/src/modules/forecourt/infrastructure/repositories/pumpMappingsRepo'
import { executePosDomsCommand } from '@/src/modules/pos/application/executePosDomsCommand'

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

const appliedKey = (changeId: number) => `fuelPriceChange.applied.${changeId}`

const FUEL_PRICE_POLL_STATUS_KEY = 'forecourt.fuelPrice.pollStatus'

export type FuelPricePollStatus = {
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  status: 'never' | 'success' | 'error'
  fetched: number
  applied: number
  skipped: number
  lastError: string | null
}

export async function getFuelPricePollStatus(
  stationId: string,
): Promise<FuelPricePollStatus> {
  const stored = await kvGet<Partial<FuelPricePollStatus>>(
    stationId,
    FUEL_PRICE_POLL_STATUS_KEY,
  )
  return {
    lastAttemptAt: stored?.lastAttemptAt ?? null,
    lastSuccessAt: stored?.lastSuccessAt ?? null,
    lastFailureAt: stored?.lastFailureAt ?? null,
    status:
      stored?.status === 'success' || stored?.status === 'error'
        ? stored.status
        : 'never',
    fetched: Number(stored?.fetched ?? 0),
    applied: Number(stored?.applied ?? 0),
    skipped: Number(stored?.skipped ?? 0),
    lastError: stored?.lastError ?? null,
  }
}

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

type ProductIdentityRow = {
  id: string
  product_id: string | null
  product_code: string | null
  ext_product_id: string | null
  ext_product_code: string | null
}

async function resolveLocalProductIdentity(
  stationId: string,
  change: FuelPriceChangeDto,
): Promise<ProductIdentityRow | null> {
  const productCode = String(change.productCode ?? '').trim()
  const productId = String(change.productId ?? '').trim()

  if (!productCode && !productId) return null

  const matches = await queryAll<ProductIdentityRow>(
    `SELECT id::text AS id,
            product_id,
            product_code,
            ext_product_id,
            ext_product_code
       FROM products
      WHERE station_id = $1
        AND (
          ($2 <> '' AND (
            UPPER(BTRIM(COALESCE(ext_product_code, ''))) = UPPER(BTRIM($2))
            OR UPPER(BTRIM(COALESCE(product_code, ''))) = UPPER(BTRIM($2))
          ))
          OR
          ($3 <> '' AND (
            BTRIM(COALESCE(ext_product_id, '')) = BTRIM($3)
            OR BTRIM(COALESCE(product_id, '')) = BTRIM($3)
          ))
        )
      ORDER BY CASE
                 WHEN $2 <> ''
                  AND UPPER(BTRIM(COALESCE(ext_product_code, ''))) = UPPER(BTRIM($2))
                   THEN 0
                 WHEN $3 <> ''
                  AND BTRIM(COALESCE(ext_product_id, '')) = BTRIM($3)
                   THEN 1
                 ELSE 2
               END,
               updated_at DESC
      LIMIT 2`,
    [stationId, productCode, productId],
  )

  if (matches.length > 1) {
    const first = matches[0]
    const second = matches[1]
    const firstKey = `${first.product_id ?? ''}|${first.product_code ?? ''}`
    const secondKey = `${second.product_id ?? ''}|${second.product_code ?? ''}`
    if (firstKey !== secondKey) {
      throw new Error(
        `Fuel price change ${change.id} matches multiple local products for cloud identity productId=${change.productId ?? 'null'}, productCode=${change.productCode ?? 'null'}`,
      )
    }
  }

  return matches[0] ?? null
}

async function resolveDomsGradeId(
  stationId: string,
  change: FuelPriceChangeDto,
): Promise<string> {
  const rows = await pumpMappingsRepo.listRowsByStationId(stationId)

  try {
    return resolveDomsGradeIdFromRows(rows, change)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/No DOMS grade mapping found/.test(message)) throw error
  }

  const localProduct = await resolveLocalProductIdentity(stationId, change)
  if (!localProduct) {
    return resolveDomsGradeIdFromRows(rows, change)
  }

  const productRowMatches = rows.filter(
    (row) => String(row.product_record_id ?? '') === localProduct.id,
  )
  if (productRowMatches.length > 0) {
    const gradeIds = Array.from(
      new Set(
        productRowMatches
          .map((row) => String(row.doms_grade_id ?? '').trim())
          .filter(Boolean),
      ),
    )
    if (gradeIds.length === 1) return gradeIds[0]
    if (gradeIds.length > 1) {
      throw new Error(
        `Fuel price change ${change.id} local product ${localProduct.product_code ?? localProduct.product_id ?? localProduct.id} maps to multiple DOMS grades: ${gradeIds.join(', ')}`,
      )
    }
  }

  try {
    return resolveDomsGradeIdFromRows(rows, {
      ...change,
      productCode: localProduct.product_code,
      productId: null,
    })
  } catch {
    throw new Error(
      `No DOMS grade mapping found for fuel price change ${change.id} after resolving cloud product productId=${change.productId ?? 'null'}, productCode=${change.productCode ?? 'null'} to local product id=${localProduct.product_id ?? 'null'}, code=${localProduct.product_code ?? 'null'}, row=${localProduct.id}. Check tank/nozzle product linkage and doms_grade_id.`,
    )
  }
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
  const lastAttemptAt = new Date().toISOString()
  const previousStatus = await getFuelPricePollStatus(stationId).catch(() => null)

  try {
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

    const summary = {
      fetched: changes.length,
      applied: results.filter((item) => item.applied).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    }
    const lastSuccessAt = new Date().toISOString()

    await kvSet(stationId, FUEL_PRICE_POLL_STATUS_KEY, {
      lastAttemptAt,
      lastSuccessAt,
      lastFailureAt: null,
      status: 'success',
      fetched: summary.fetched,
      applied: summary.applied,
      skipped: summary.skipped,
      lastError: null,
    })

    return summary
  } catch (error) {
    const lastFailureAt = new Date().toISOString()
    const message =
      error instanceof Error ? error.message : String(error ?? 'Fuel price poll failed')

    await kvSet(stationId, FUEL_PRICE_POLL_STATUS_KEY, {
      lastAttemptAt,
      lastSuccessAt: previousStatus?.lastSuccessAt ?? null,
      lastFailureAt,
      status: 'error',
      fetched: 0,
      applied: 0,
      skipped: 0,
      lastError: message,
    }).catch(() => {})

    throw error
  }
}

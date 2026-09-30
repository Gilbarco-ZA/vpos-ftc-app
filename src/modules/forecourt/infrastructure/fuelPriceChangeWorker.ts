import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { logger } from '@/src/shared/utils/logger'
import {
  type FuelPriceChangeDto,
  getFuelPriceChangesViaProxy,
} from '@/src/shared/proxy/client'

import { runPosDomsCommand } from '@/src/modules/pos/application/runPosDomsCommand'
import { pumpMappingsRepo } from '@/src/modules/forecourt/infrastructure/repositories/pumpMappingsRepo'

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
    const codeMatches =
      Boolean(productCode) &&
      [row.ext_product_code, row.product_code].some(
        (value) => normalize(value) === productCode,
      )
    const idMatches =
      Boolean(productId) &&
      [row.ext_product_id, row.product_id].some(
        (value) => normalize(value) === productId,
      )
    return codeMatches || idMatches
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
  nowMs = Date.now(),
): Record<string, unknown> {
  const newPrice = Number(change.newPrice)
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    throw new Error(
      `Fuel price change ${change.id} has invalid newPrice=${String(change.newPrice)}`,
    )
  }

  const effectiveAt = new Date(change.effectiveAt)
  if (Number.isNaN(effectiveAt.getTime())) {
    throw new Error(
      `Fuel price change ${change.id} has invalid effectiveAt=${String(change.effectiveAt)}`,
    )
  }

  const payload: Record<string, unknown> = {
    entries: [{ gradeId, price: newPrice }],
    requestedBy: 'vpos-cloud-fuel-price-change',
  }

  if (effectiveAt.getTime() <= nowMs) {
    payload.applyNow = true
  } else {
    payload.effectiveAt = effectiveAt.toISOString()
  }

  return payload
}

async function applyFuelPriceChange(
  stationId: string,
  change: FuelPriceChangeDto,
) {
  const existing = await kvGet(stationId, appliedKey(change.id))
  if (existing) {
    return { applied: false, skipped: true, reason: 'already_applied' }
  }

  const gradeId = await resolveDomsGradeId(stationId, change)
  const payload = buildDomsPriceChangePayload(change, gradeId)
  const newPrice = Number(change.newPrice)

  const response = await runPosDomsCommand(
    stationId,
    'changeGradePrices',
    payload,
  )
  const result = await response.json()

  if (!result?.success) {
    throw new Error(
      String(
        result?.message ??
          result?.error?.message ??
          `DOMS rejected fuel price change ${change.id}`,
      ),
    )
  }

  await kvSet(stationId, appliedKey(change.id), {
    changeId: change.id,
    productId: change.productId ?? null,
    productCode: change.productCode ?? null,
    gradeId,
    newPrice,
    effectiveAt: change.effectiveAt,
    appliedAt: new Date().toISOString(),
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
      String(response.data.message ?? 'Fuel price change response reported an error'),
    )
  }

  const changes = Array.isArray(response.data?.fuelPriceChanges)
    ? [...response.data.fuelPriceChanges]
    : []

  changes.sort((a, b) => {
    const at = new Date(a.effectiveAt).getTime()
    const bt = new Date(b.effectiveAt).getTime()
    if (at !== bt) return at - bt
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

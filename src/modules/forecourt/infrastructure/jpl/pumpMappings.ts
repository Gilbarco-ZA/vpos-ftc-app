import type {
  PumpMapping,
  PumpMappingsCache,
} from '@/src/modules/forecourt/infrastructure/jpl/types'

import { pumpMappingsRepo } from '@/src/modules/forecourt/infrastructure/repositories/pumpMappingsRepo'

const PUMP_MAP_TTL_MS = 60_000

type PumpMappingsInflight = Map<string, Promise<Map<number, PumpMapping>>>

const getInflightPumpMappings = () => {
  const anyGlobal = globalThis as any
  if (!anyGlobal.__jplPumpMappingsInflight) {
    anyGlobal.__jplPumpMappingsInflight = new Map() as PumpMappingsInflight
  }
  return anyGlobal.__jplPumpMappingsInflight as PumpMappingsInflight
}

export const invalidateJplPumpMappings = (stationId?: string) => {
  const normalizedStationId = String(stationId ?? '').trim()
  const cache = globalThis.__jplPumpMappingsCache as
    | PumpMappingsCache
    | undefined

  if (!normalizedStationId || cache?.stationId === normalizedStationId) {
    globalThis.__jplPumpMappingsCache = undefined
  }

  const inflight = getInflightPumpMappings()
  if (normalizedStationId) inflight.delete(normalizedStationId)
  else inflight.clear()
}

export const getJplPumpMappings = async (
  stationId: string,
): Promise<Map<number, PumpMapping>> => {
  const cache = globalThis.__jplPumpMappingsCache as
    | PumpMappingsCache
    | undefined
  if (
    cache &&
    cache.stationId === stationId &&
    Date.now() - cache.loadedAt < PUMP_MAP_TTL_MS
  ) {
    return cache.map
  }

  const inflight = getInflightPumpMappings()
  const existing = inflight.get(stationId)
  if (existing) return await existing

  const loadPromise = (async () => {
    const rows = await pumpMappingsRepo.listRowsByStationId(stationId)
    const map = new Map<number, PumpMapping>()

    for (const row of rows) {
      if (!Number.isFinite(row.pump_number ?? NaN)) continue
      const pumpNumber = Number(row.pump_number)
      const domsFpId = Number.isFinite(row.doms_fp_id ?? NaN)
        ? Number(row.doms_fp_id)
        : null
      const deviceSubAddress = Number.isFinite(
        row.doms_device_sub_address ?? NaN,
      )
        ? Number(row.doms_device_sub_address)
        : null
      const mapKey = domsFpId ?? pumpNumber

      if (!map.has(mapKey)) {
        map.set(mapKey, {
          pumpNumber,
          domsFpId,
          deviceSubAddress,
          nozzles: [],
        })
      }

      if (row.nozzle_id && Number.isFinite(row.nozzle_number ?? NaN)) {
        const nozzleNumber = Number(row.nozzle_number)
        const domsGradeOptionId = Number.isFinite(
          row.doms_grade_option_id ?? NaN,
        )
          ? Number(row.doms_grade_option_id)
          : null

        map.get(mapKey)?.nozzles.push({
          nozzleId: row.nozzle_id,
          nozzleNumber,
          fuelType: row.product_name ?? row.product_code ?? null,
          productCode: row.product_code ?? null,
          domsGradeOptionId,
          domsGradeId: row.doms_grade_id ?? null,
          domsTankId: row.doms_tank_id ?? null,
        })
      }
    }

    globalThis.__jplPumpMappingsCache = {
      stationId,
      loadedAt: Date.now(),
      map,
    }

    return map
  })()

  inflight.set(stationId, loadPromise)
  try {
    return await loadPromise
  } finally {
    if (inflight.get(stationId) === loadPromise) {
      inflight.delete(stationId)
    }
  }
}

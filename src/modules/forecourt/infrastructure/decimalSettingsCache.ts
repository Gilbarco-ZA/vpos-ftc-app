import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'

import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

const DECIMAL_CACHE_TTL_MS = 60_000

const cache = new Map<string, { value: DecimalSettings; fetchedAt: number }>()

export const getStationDecimalSettingsCached = async (
  stationId: string,
): Promise<DecimalSettings> => {
  const now = Date.now()
  const cached = cache.get(stationId)
  if (cached && now - cached.fetchedAt < DECIMAL_CACHE_TTL_MS) {
    return cached.value
  }

  const value = await getStationDecimalSettings(stationId)
  cache.set(stationId, { value, fetchedAt: now })
  return value
}

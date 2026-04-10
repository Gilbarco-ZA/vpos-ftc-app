import { KV_KEYS, storeStationKv } from '@/src/shared/setup/api'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function finalizeAdminSetup(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')

  await Promise.all([
    storeStationKv(normalizedStationId, KV_KEYS.SETUP_STEP, 'finalized'),
    storeStationKv(
      normalizedStationId,
      KV_KEYS.SETUP_UPDATED_AT,
      new Date().toISOString(),
    ),
    storeStationKv(normalizedStationId, KV_KEYS.SETUP_COMPLETE, true),
  ])

  return {
    success: true,
    stationId: normalizedStationId,
    message: 'Setup finalized',
  }
}

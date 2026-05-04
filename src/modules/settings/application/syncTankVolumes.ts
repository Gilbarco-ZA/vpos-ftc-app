import { syncTankGaugeVolumes } from '@/src/shared/doms/tankGauge'
import { requestTankGaugeSnapshot } from '@/src/shared/forecourt/jplTankGauge'

export async function syncTankVolumes(stationId: string) {
  if (!stationId) {
    return { synced: 0, tanks: [] }
  }

  const tankGaugePayload = await requestTankGaugeSnapshot()
  const result = await syncTankGaugeVolumes(stationId, tankGaugePayload)

  return {
    synced: Number(result.updated ?? 0),
    tanks: Array.isArray(result.tanks) ? result.tanks : [],
  }
}

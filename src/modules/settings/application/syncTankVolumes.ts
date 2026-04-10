import { syncTankGaugeVolumes } from '@/src/shared/doms/tankGauge'
import { requestTankGaugeSnapshot } from '@/src/shared/forecourt/jplTankGauge'

export async function syncTankVolumes(stationId: string) {
  if (!stationId) {
    return { synced: 0 }
  }

  const tankGaugePayload = await requestTankGaugeSnapshot()
  const synced = await syncTankGaugeVolumes(stationId, tankGaugePayload)

  return { synced }
}

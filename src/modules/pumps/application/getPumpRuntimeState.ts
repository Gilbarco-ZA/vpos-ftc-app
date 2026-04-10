import { loadPumpStatePayload } from '../infrastructure/pumpStateRepo'

export async function getPumpRuntimeState(stationId: string) {
  const normalizedStationId = String(stationId ?? '').trim()
  if (!normalizedStationId) {
    throw new Error('stationId is required')
  }
  return await loadPumpStatePayload(normalizedStationId)
}

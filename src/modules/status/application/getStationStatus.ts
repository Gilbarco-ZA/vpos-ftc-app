import { getSetupStatus } from '@/src/shared/setup/api'

export async function getStationStatus(stationId: string) {
  return await getSetupStatus(stationId)
}

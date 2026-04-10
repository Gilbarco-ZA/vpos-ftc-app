import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { refreshForecourtTankStatusRepo } from '../infrastructure/configSyncRepo'

export async function refreshForecourtTankStatus(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await refreshForecourtTankStatusRepo(scopedStationId)
}

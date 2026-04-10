import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getForecourtSyncStatus as getForecourtSyncStatusRepo } from '../infrastructure/configSyncRepo'

export async function getForecourtSyncStatus(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getForecourtSyncStatusRepo(scopedStationId)
}

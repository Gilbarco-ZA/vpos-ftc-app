import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getForecourtSyncConfigRepo } from '../infrastructure/forecourtRepo'

export async function getForecourtSyncConfig(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getForecourtSyncConfigRepo(scopedStationId)
}

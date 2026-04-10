import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { syncForecourtSnapshotRepo } from '../infrastructure/forecourtRepo'

export async function syncForecourtSnapshot(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await syncForecourtSnapshotRepo(scopedStationId)
}

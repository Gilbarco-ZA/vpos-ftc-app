import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getTankLevelsSnapshotRepo } from '@/src/modules/tank-levels/infrastructure/tankLevelsRepo'

export async function getTankLevelsSnapshot(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getTankLevelsSnapshotRepo(scopedStationId)
}

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getStationConfigRepo } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function getAdminStationConfig(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getStationConfigRepo(scopedStationId)
}

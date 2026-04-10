import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getStationConfigStatusRepo } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function getAdminConfigStatus(stationId: string) {
  return await getStationConfigStatusRepo(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

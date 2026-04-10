import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listDeviceConfigs } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function getAdminDeviceConfigs(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await listDeviceConfigs(scopedStationId)
}

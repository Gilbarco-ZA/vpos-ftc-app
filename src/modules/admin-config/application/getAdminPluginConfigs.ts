import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listPluginConfigs } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function getAdminPluginConfigs(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return await listPluginConfigs(scopedStationId)
}

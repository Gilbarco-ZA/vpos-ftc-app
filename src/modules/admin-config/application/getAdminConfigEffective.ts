import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getEffectiveSystemConfigurationRepo } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function getAdminConfigEffective(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const effective =
    await getEffectiveSystemConfigurationRepo(normalizedStationId)
  return ensurePlainObject(effective)
}

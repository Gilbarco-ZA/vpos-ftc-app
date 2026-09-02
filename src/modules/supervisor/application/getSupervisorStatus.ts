import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getVposSupervisorStatus } from '@/src/modules/supervisor/application/vposSupervisor'

export async function getSupervisorStatus(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const status = await getVposSupervisorStatus(normalizedStationId)
  return ensurePlainObject(status)
}

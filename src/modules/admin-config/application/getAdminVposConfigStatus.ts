import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getSupervisorStatus } from '@/src/modules/supervisor/application/getSupervisorStatus'

export async function getAdminVposConfigStatus(stationId: string) {
  const status = await getSupervisorStatus(
    requireNonEmptyString(stationId, 'stationId'),
  )
  return ensurePlainObject(status)
}

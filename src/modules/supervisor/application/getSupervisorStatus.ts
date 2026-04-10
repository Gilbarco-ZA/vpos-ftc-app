import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'
import { getVposSupervisorStatus } from '@/src/shared/vpos/supervisor'

export async function getSupervisorStatus(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const status = await getVposSupervisorStatus(normalizedStationId)
  return ensurePlainObject(status)
}

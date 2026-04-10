import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getForecourtRuntimeStatusRepo } from '../infrastructure/forecourtRepo'

export async function getForecourtRuntimeStatus(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const runtimeStatus = await getForecourtRuntimeStatusRepo(scopedStationId)
  return ensurePlainObject(runtimeStatus)
}

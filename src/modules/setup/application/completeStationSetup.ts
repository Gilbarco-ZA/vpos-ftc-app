import { completeSetup } from '@/src/shared/setup/complete'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function completeStationSetup(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await completeSetup(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}

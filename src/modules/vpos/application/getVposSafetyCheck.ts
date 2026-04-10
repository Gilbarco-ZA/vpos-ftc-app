import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'
import { getVposSafetyCheck } from '@/src/shared/vpos/restart'

export async function readVposSafetyCheck(args: { stationId: string }) {
  const normalizedStationId = requireNonEmptyString(args.stationId, 'stationId')
  const safetyCheck = await getVposSafetyCheck(normalizedStationId)
  return ensurePlainObject(safetyCheck)
}

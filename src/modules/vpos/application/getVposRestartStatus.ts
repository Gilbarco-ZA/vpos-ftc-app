import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'
import { getVposRestartStatus } from '@/src/shared/vpos/restart'

export async function readVposRestartStatus(args: { stationId: string }) {
  const normalizedStationId = requireNonEmptyString(args.stationId, 'stationId')
  const restartStatus = await getVposRestartStatus(normalizedStationId)
  return ensurePlainObject(restartStatus)
}

import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getVposRestartConfig } from '@/src/modules/supervisor/application/vposSupervisor'

export async function readVposRestartConfig(args: { stationId: string }) {
  const normalizedStationId = requireNonEmptyString(args.stationId, 'stationId')
  const restartConfig = await getVposRestartConfig(normalizedStationId)
  return ensurePlainObject(restartConfig)
}

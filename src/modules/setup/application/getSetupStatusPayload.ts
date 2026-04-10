import { getSetupFlags, getSetupStatus } from '@/src/shared/setup/api'
import { optionalNonEmptyString } from '@/src/shared/utils/inputs'

import { getOrCreateSetupStationId } from './context'

export async function getSetupStatusPayload(stationId?: string) {
  const resolvedStationId =
    optionalNonEmptyString(stationId) || (await getOrCreateSetupStationId())
  const [status, flags] = await Promise.all([
    getSetupStatus(resolvedStationId),
    getSetupFlags(resolvedStationId),
  ])
  return {
    success: true,
    stationId: resolvedStationId,
    flags,
    status: status?.data ?? status,
  }
}

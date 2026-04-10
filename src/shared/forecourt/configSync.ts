import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import {
  getForecourtSyncConfig as getForecourtSyncConfigImpl,
  getForecourtSyncStatus as getForecourtSyncStatusImpl,
  refreshTankStatus as refreshTankStatusImpl,
  runForecourtConfigSync as runForecourtConfigSyncImpl,
} from '@/src/modules/forecourt/infrastructure/configSync/service'

export async function getForecourtSyncConfig(stationId: string) {
  return await getForecourtSyncConfigImpl(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function getForecourtSyncStatus(stationId: string) {
  return await getForecourtSyncStatusImpl(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function refreshTankStatus(
  stationId: string,
  payload: unknown = null,
) {
  return await refreshTankStatusImpl(
    requireNonEmptyString(stationId, 'stationId'),
    payload,
  )
}

export async function runForecourtConfigSync(args: {
  stationId: string
  force?: boolean
  includeTankStatus?: boolean
}) {
  return await runForecourtConfigSyncImpl({
    stationId: requireNonEmptyString(args.stationId, 'stationId'),
    force: args.force,
    includeTankStatus: args.includeTankStatus,
  })
}

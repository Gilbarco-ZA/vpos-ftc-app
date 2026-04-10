import {
  getForecourtSyncConfig as getForecourtSyncConfigShared,
  getForecourtSyncStatus as getForecourtSyncStatusShared,
  refreshTankStatus as refreshTankStatusShared,
  runForecourtConfigSync as runForecourtConfigSyncShared,
} from '@/src/shared/forecourt/configSync'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getForecourtSyncConfig(stationId: string) {
  return await getForecourtSyncConfigShared(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function getForecourtSyncStatus(stationId: string) {
  return await getForecourtSyncStatusShared(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function refreshTankStatus(stationId: string) {
  return await refreshTankStatusShared(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function runForecourtConfigSync(input: {
  stationId: string
  force?: boolean
  includeTankStatus?: boolean
}) {
  return await runForecourtConfigSyncShared({
    stationId: requireNonEmptyString(input.stationId, 'stationId'),
    force: Boolean(input.force),
    includeTankStatus: Boolean(input.includeTankStatus),
  })
}

export async function refreshForecourtTankStatusRepo(stationId: string) {
  return await refreshTankStatus(requireNonEmptyString(stationId, 'stationId'))
}

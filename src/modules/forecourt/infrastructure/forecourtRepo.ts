import {
  getForecourtSyncConfig,
  runForecourtConfigSync,
} from '@/src/shared/forecourt/configSync'
import { sendForecourtCommand } from '@/src/shared/forecourt/gateway'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtime'

export async function getForecourtSyncConfigRepo(stationId: string) {
  return await getForecourtSyncConfig(stationId)
}

export async function syncForecourtSnapshotRepo(stationId: string) {
  return await runForecourtConfigSync({ stationId })
}

export function getForecourtRuntimeStatusRepo(_stationId: string) {
  return getForecourtRuntimeConfig()
}

export async function sendForecourtCommandRepo(input: any) {
  return await sendForecourtCommand(input)
}

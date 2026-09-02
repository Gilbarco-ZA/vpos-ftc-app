import {
  getForecourtSyncConfig,
  runForecourtConfigSync,
} from '@/src/modules/forecourt/application/forecourtConfigSync'
import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/application/forecourtRuntime'
import { sendForecourtCommand } from '@/src/modules/forecourt/infrastructure/gateway'

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

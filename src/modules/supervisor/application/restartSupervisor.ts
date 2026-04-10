import { requireNonEmptyString } from '@/src/shared/utils/inputs'
import {
  reloadVposSupervisorRuntimeConfig,
  requestVposSupervisorRestart,
} from '@/src/shared/vpos/supervisor'

export async function restartSupervisor(stationId: string) {
  return await requestVposSupervisorRestart(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function reloadSupervisorConfig(stationId: string) {
  return await reloadVposSupervisorRuntimeConfig(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

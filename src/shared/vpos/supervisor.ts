import type { RestartConfig } from '@/src/shared/vpos/restart'

import { getRuntimeManager } from '@/src/shared/runtime/manager'
import {
  ensurePlainObject,
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getRestartManager } from '@/src/modules/supervisor/infrastructure/restartSingleton'

export async function getVposSupervisorStatus(stationId: string) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).status()
}

export async function getVposPosSupervisorStatus(stationId: string) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).posControl.getShiftState()
}

export async function requestVposSupervisorRestart(
  stationId: string,
  reason?: string,
) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).restart(optionalNonEmptyString(reason) ?? 'manual')
}

export async function reloadVposSupervisorRuntimeConfig(stationId: string) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).reloadConfig()
}

export async function getVposRestartConfig(
  stationId: string,
): Promise<RestartConfig> {
  return await getRestartManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).getConfig()
}

export async function setVposRestartConfig(
  stationId: string,
  body: Record<string, unknown>,
) {
  return await getRestartManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).setConfig(ensurePlainObject(body))
}

export async function reloadVposRestartManagerConfig(stationId: string) {
  return await getRestartManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).reloadConfig()
}

export async function requestVposRestartManagerRestart(stationId: string) {
  await getRestartManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).restart('manual')
  return { message: 'Restart requested' }
}

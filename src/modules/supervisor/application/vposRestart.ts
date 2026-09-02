import type {
  RestartConfig,
  RestartReason,
  RestartStatus,
  SafetyCheckResult,
} from '@/src/modules/supervisor/contracts/restart'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getRestartManager } from '@/src/modules/supervisor/infrastructure/restartSingleton'

export type { RestartConfig, RestartReason, RestartStatus, SafetyCheckResult }

export async function getVposRestartStatus(
  stationId: string,
): Promise<RestartStatus> {
  return await getRestartManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).getStatus()
}

export async function getVposSafetyCheck(
  stationId: string,
): Promise<SafetyCheckResult> {
  return await getRestartManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).safetyCheck()
}

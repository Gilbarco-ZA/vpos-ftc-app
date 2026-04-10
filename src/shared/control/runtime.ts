import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getControlRuntimeStatus(stationId: string) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).status()
}

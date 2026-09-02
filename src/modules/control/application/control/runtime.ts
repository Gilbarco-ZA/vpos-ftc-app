import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getRuntimeManager } from '@/src/modules/runtime/application/runtimeManager'

export async function getControlRuntimeStatus(stationId: string) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).status()
}

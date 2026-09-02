import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getRuntimeManager } from '@/src/modules/runtime/application/runtimeManager'

export async function getSupervisorProcessStatus(
  stationId: string,
  name: string,
) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).supervisor.getProcessStatus(requireNonEmptyString(name, 'name'))
}

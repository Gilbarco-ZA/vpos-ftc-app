import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getRuntimeManager } from '@/src/modules/runtime/application/runtimeManager'

export async function runSupervisorProcessAction(
  stationId: string,
  name: string,
  action: string,
) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).supervisor.commandProcess(
    requireNonEmptyString(name, 'name'),
    requireNonEmptyString(action, 'action'),
  )
}

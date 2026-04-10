import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

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

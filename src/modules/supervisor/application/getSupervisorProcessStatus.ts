import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getSupervisorProcessStatus(
  stationId: string,
  name: string,
) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).supervisor.getProcessStatus(requireNonEmptyString(name, 'name'))
}

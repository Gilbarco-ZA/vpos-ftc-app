import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getVposSupervisorStatus } from '@/src/modules/supervisor/application/vposSupervisor'

export async function getVposStatus(args: { stationId: string }) {
  return await getVposSupervisorStatus(
    requireNonEmptyString(args.stationId, 'stationId'),
  )
}

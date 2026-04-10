import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { listForecourtState } from '../infrastructure/adminRepo'

export async function listAdminForecourtState(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const data = await listForecourtState(normalizedStationId)
  return { stationId: normalizedStationId, data }
}

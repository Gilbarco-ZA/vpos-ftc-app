import { loadPosIntegrations } from '@/src/shared/integrations/posConfig'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getAdminPosIntegrations(stationId: string) {
  return await loadPosIntegrations(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

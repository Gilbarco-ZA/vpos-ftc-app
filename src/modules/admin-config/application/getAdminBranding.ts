import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getBrandingSettingsRepo } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function getAdminBranding(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  return await getBrandingSettingsRepo(normalizedStationId)
}

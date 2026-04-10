import { syncSiteProfileFromProxy } from '@/src/shared/setup/siteProfile'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function syncSetupSiteProfile(stationId: string) {
  return await syncSiteProfileFromProxy(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

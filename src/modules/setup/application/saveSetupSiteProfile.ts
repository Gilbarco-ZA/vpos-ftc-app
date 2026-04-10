import { saveSiteProfile } from '@/src/shared/setup/siteProfile'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function saveSetupSiteProfile(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await saveSiteProfile(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject(payload),
  )
}

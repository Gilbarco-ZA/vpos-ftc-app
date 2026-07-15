import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { buildDomsFirstSiteAcceptancePack } from './domsFirstSiteAcceptancePack'
import { getDomsFieldValidationReadiness } from './getDomsFieldValidationReadiness'

export const getDomsFirstSiteAcceptancePack = async (stationId: string) => {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const readiness = await getDomsFieldValidationReadiness(normalizedStationId)
  return buildDomsFirstSiteAcceptancePack({
    stationId: normalizedStationId,
    readiness,
  })
}

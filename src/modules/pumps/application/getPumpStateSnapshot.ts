import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getPumpState } from '../infrastructure/pumpStore'

export function getPumpStateSnapshot(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  return getPumpState(scopedStationId)
}

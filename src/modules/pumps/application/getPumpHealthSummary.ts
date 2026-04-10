import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getPumpState } from '../infrastructure/pumpStore'

export function getPumpHealthSummary(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const snapshot = getPumpState(normalizedStationId)
  const summary = {
    stationId: normalizedStationId,
    updatedAt: snapshot.updatedAt,
    totalPumps: snapshot.pumps.length,
    online: 0,
    offline: 0,
    unknown: 0,
  }

  for (const pump of snapshot.pumps) {
    if (pump.health === 'online') summary.online += 1
    else if (pump.health === 'offline') summary.offline += 1
    else summary.unknown += 1
  }

  return summary
}

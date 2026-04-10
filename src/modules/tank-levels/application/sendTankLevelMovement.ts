import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { sendMovementToProxyRepo } from '@/src/modules/tank-levels/infrastructure/tankLevelsRepo'

export async function sendTankLevelMovement(
  stationId: string,
  movementId: string,
) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const scopedMovementId = requireNonEmptyString(movementId, 'movementId')
  return await sendMovementToProxyRepo(scopedStationId, scopedMovementId)
}

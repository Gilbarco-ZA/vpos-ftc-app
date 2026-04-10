import type { PosCommand } from '@/src/platform/integrations/jpl/types'

import { sendPosCommand as sendPosGatewayCommand } from '@/src/platform/integrations/posGateway'
import { getRuntimeManager } from '@/src/shared/runtime/manager'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function sendPosCommand(stationId: string, command: PosCommand) {
  return await sendPosGatewayCommand(
    requireNonEmptyString(stationId, 'stationId'),
    command,
  )
}

export async function getShiftState(stationId: string) {
  return await getRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  ).posControl.getShiftState()
}

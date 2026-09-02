import type { PosCommand } from '@/src/platform/integrations/jpl/types'

import { sendPosCommand as sendPosGatewayCommand } from '@/src/platform/integrations/posGateway'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getRuntimeManager } from '@/src/modules/runtime/application/runtimeManager'

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

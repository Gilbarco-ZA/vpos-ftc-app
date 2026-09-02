import type { PosCommandRequest } from '@/src/modules/pos/contracts/commands'

import { handleSharedPosCommand } from '@/src/modules/pos/application/posCommands'
import { POS_COMMAND_TYPES } from '@/src/modules/pos/contracts/commands'

export { POS_COMMAND_TYPES, type PosCommandRequest }

export function isValidVposPosCommandType(
  type: unknown,
): type is PosCommandRequest['type'] {
  return typeof type === 'string' && POS_COMMAND_TYPES.includes(type as any)
}

export async function getVposPosStatus(stationId: string) {
  return await handleSharedPosCommand(stationId, { type: 'POS_STATUS' })
}

export async function dispatchVposPosCommand(
  stationId: string,
  body: PosCommandRequest,
) {
  return await handleSharedPosCommand(stationId, body)
}

export async function getVposDailyData(stationId: string) {
  return await handleSharedPosCommand(stationId, { type: 'GET_DAILY_DATA' })
}

export async function captureVposCustomerDetails(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await handleSharedPosCommand(stationId, {
    type: 'CAPTURE_CUSTOMER_DETAILS',
    payload,
  })
}

export async function clearVposCustomerDetails(stationId: string) {
  return await handleSharedPosCommand(stationId, {
    type: 'CLEAR_CUSTOMER_DETAILS',
  })
}

export async function completeVposTransaction(
  stationId: string,
  payload: Record<string, unknown>,
) {
  return await handleSharedPosCommand(stationId, {
    type: 'COMPLETE_TRANSACTION',
    payload,
  })
}

import { sendPosCommand } from '@/src/shared/vpos/posControlClient'

export type PosDomsRouteCommand =
  | 'changeDynamicTankData'
  | 'changeGradePrices'
  | 'getAllTankDeliveryData'
  | 'getAllTgData'
  | 'getGradePrices'
  | 'getTgErrorMsg'

const POS_DOMS_COMMAND_TYPES: Record<PosDomsRouteCommand, string> = {
  changeDynamicTankData: 'CHANGE_DYNAMIC_TANK_DATA',
  changeGradePrices: 'CHANGE_GRADE_PRICES',
  getAllTankDeliveryData: 'GET_ALL_TANK_DELIVERY_DATA',
  getAllTgData: 'GET_ALL_TG_DATA',
  getGradePrices: 'GET_GRADE_PRICES',
  getTgErrorMsg: 'GET_TG_ERROR_MSG',
}

export function getPosDomsCommandType(command: PosDomsRouteCommand) {
  return POS_DOMS_COMMAND_TYPES[command]
}

export async function dispatchPosDomsCommand(
  stationId: string,
  command: PosDomsRouteCommand,
  payload?: unknown,
) {
  const type = getPosDomsCommandType(command)
  return await sendPosCommand(
    stationId,
    payload === undefined ? ({ type } as any) : ({ type, payload } as any),
  )
}

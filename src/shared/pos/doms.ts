import { sendPosCommand } from '@/src/shared/vpos/posControlClient'

export type PosDomsRouteCommand =
  | 'changeDynamicTankData'
  | 'changeGradePrices'
  | 'getAllTankDeliveryData'
  | 'getAllTgData'
  | 'getSiteDeliveryStatus'
  | 'getTgStatus'
  | 'clearTankDeliveryData'
  | 'openTankController'
  | 'closeTankController'
  | 'startDeliveryProcess'
  | 'stopDeliveryProcess'
  | 'getGradePrices'
  | 'getTgErrorMsg'

const POS_DOMS_COMMAND_TYPES: Record<PosDomsRouteCommand, string> = {
  changeDynamicTankData: 'CHANGE_DYNAMIC_TANK_DATA',
  changeGradePrices: 'CHANGE_GRADE_PRICES',
  getAllTankDeliveryData: 'GET_ALL_TANK_DELIVERY_DATA',
  getAllTgData: 'GET_ALL_TG_DATA',
  getSiteDeliveryStatus: 'GET_SITE_DELIVERY_STATUS',
  getTgStatus: 'GET_TG_STATUS',
  clearTankDeliveryData: 'CLEAR_TANK_DELIVERY_DATA',
  openTankController: 'OPEN_TANK_CONTROLLER',
  closeTankController: 'CLOSE_TANK_CONTROLLER',
  startDeliveryProcess: 'START_DELIVERY_PROCESS',
  stopDeliveryProcess: 'STOP_DELIVERY_PROCESS',
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

import { sendPosCommand } from '@/src/modules/pos/application/posControlClient'

export type PosDomsRouteCommand =
  | 'getFpGradeTotals'
  | 'getPumpGradeTotals'
  | 'getPumpGradeBlendTotals'
  | 'getFallbackTotals'
  | 'clearFallbackTotals'
  | 'getTankControlStatus'
  | 'markDeliveryStarting'
  | 'markDeliveryFinished'
  | 'blockTank'
  | 'unblockTank'
  | 'clearTgError'
  | 'resetTg'
  | 'getFcDateTime'
  | 'changeFcDateTime'
  | 'getFcOperationModeStatus'
  | 'changeFcOperationMode'
  | 'utilEcho'
  | 'changeDynamicTankData'
  | 'changeGradePrices'
  | 'clearPendingPriceSet'
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
  getFpGradeTotals: 'GET_FP_GRADE_TOTALS',
  getPumpGradeTotals: 'GET_PUMP_GRADE_TOTALS',
  getPumpGradeBlendTotals: 'GET_PUMP_GRADE_BLEND_TOTALS',
  getFallbackTotals: 'GET_FALLBACK_TOTALS',
  clearFallbackTotals: 'CLEAR_FALLBACK_TOTALS',
  getTankControlStatus: 'GET_TANK_CONTROL_STATUS',
  markDeliveryStarting: 'MARK_DELIVERY_STARTING',
  markDeliveryFinished: 'MARK_DELIVERY_FINISHED',
  blockTank: 'BLOCK_TANK',
  unblockTank: 'UNBLOCK_TANK',
  clearTgError: 'CLEAR_TG_ERROR',
  resetTg: 'RESET_TG',
  getFcDateTime: 'GET_FC_DATE_TIME',
  changeFcDateTime: 'CHANGE_FC_DATE_TIME',
  getFcOperationModeStatus: 'GET_FC_OPERATION_MODE_STATUS',
  changeFcOperationMode: 'CHANGE_FC_OPERATION_MODE',
  utilEcho: 'UTIL_ECHO',
  changeDynamicTankData: 'CHANGE_DYNAMIC_TANK_DATA',
  changeGradePrices: 'CHANGE_GRADE_PRICES',
  clearPendingPriceSet: 'CLEAR_PENDING_PRICE_SET',
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

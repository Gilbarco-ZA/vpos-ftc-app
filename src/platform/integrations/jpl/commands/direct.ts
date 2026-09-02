import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

import { buildJplCommandRequest } from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'

const DIRECT_JPL_COMMAND_ACTIONS: Record<string, string> = {
  GET_FP_GRADE_TOTALS: 'GET_FP_GRADE_TOTALS',
  GET_PUMP_GRADE_TOTALS: 'GET_PUMP_GRADE_TOTALS',
  GET_PUMP_GRADE_BLEND_TOTALS: 'GET_PUMP_GRADE_BLEND_TOTALS',
  GET_FALLBACK_TOTALS: 'GET_FALLBACK_TOTALS',
  CLEAR_FALLBACK_TOTALS: 'CLEAR_FALLBACK_TOTALS',
  GET_TANK_CONTROL_STATUS: 'GET_TANK_CONTROL_STATUS',
  MARK_DELIVERY_STARTING: 'MARK_DELIVERY_STARTING',
  MARK_DELIVERY_FINISHED: 'MARK_DELIVERY_FINISHED',
  BLOCK_TANK: 'BLOCK_TANK',
  UNBLOCK_TANK: 'UNBLOCK_TANK',
  CLEAR_TG_ERROR: 'CLEAR_TG_ERROR',
  RESET_TG: 'RESET_TG',
  GET_FC_DATE_TIME: 'GET_FC_DATE_TIME',
  CHANGE_FC_DATE_TIME: 'CHANGE_FC_DATE_TIME',
  GET_FC_OPERATION_MODE_STATUS: 'GET_FC_OPERATION_MODE_STATUS',
  CHANGE_FC_OPERATION_MODE: 'CHANGE_FC_OPERATION_MODE',
  UTIL_ECHO: 'UTIL_ECHO',
}

const DIRECT_JPL_COMMAND_TIMEOUTS: Record<string, string> = {
  GET_FP_GRADE_TOTALS: 'Timed out requesting fuelling point grade totals',
  GET_PUMP_GRADE_TOTALS: 'Timed out requesting pump grade totals',
  GET_PUMP_GRADE_BLEND_TOTALS: 'Timed out requesting pump grade blend totals',
  GET_FALLBACK_TOTALS: 'Timed out requesting fallback totals',
  CLEAR_FALLBACK_TOTALS: 'Timed out clearing fallback totals',
  GET_TANK_CONTROL_STATUS: 'Timed out requesting tank control status',
  MARK_DELIVERY_STARTING: 'Timed out marking delivery start',
  MARK_DELIVERY_FINISHED: 'Timed out marking delivery finish',
  BLOCK_TANK: 'Timed out blocking tank',
  UNBLOCK_TANK: 'Timed out unblocking tank',
  CLEAR_TG_ERROR: 'Timed out clearing tank gauge error',
  RESET_TG: 'Timed out resetting tank gauge',
  GET_FC_DATE_TIME: 'Timed out requesting forecourt date and time',
  CHANGE_FC_DATE_TIME: 'Timed out setting forecourt date and time',
  GET_FC_OPERATION_MODE_STATUS:
    'Timed out requesting forecourt operation mode status',
  CHANGE_FC_OPERATION_MODE: 'Timed out changing forecourt operation mode',
  UTIL_ECHO: 'Timed out sending JPL echo command',
}

export type DirectCommandDeps = {
  pick: (value: any, keys: string[]) => any
  requestWithTimeout: (
    client: any,
    message: any,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<any>
}

export async function handleDirectCommand(
  context: JplCommandContext,
  deps: DirectCommandDeps,
): Promise<JplCommandHandlerResult> {
  const directAction = DIRECT_JPL_COMMAND_ACTIONS[context.cmd.type]
  if (!directAction) return null

  const payload = ((context.cmd as any).payload ?? {}) as Record<
    string,
    unknown
  >
  const request = buildJplCommandRequest(directAction, {
    ...payload,
    posId: deps.pick(payload, ['posId', 'PosId']) ?? context.posId,
  })
  if (!request) throw new Error(`Unable to build ${directAction} request`)

  const response = await deps.requestWithTimeout(
    context.client,
    request,
    context.timeoutMs,
    DIRECT_JPL_COMMAND_TIMEOUTS[context.cmd.type] ??
      `Timed out sending ${context.cmd.type}`,
  )
  return {
    ok: true,
    accepted: true,
    data: {
      request: {
        name: request.name,
        subCode: request.subCode,
        data: request.data,
        correlationId: request.correlationId,
      },
      response,
    },
  }
}

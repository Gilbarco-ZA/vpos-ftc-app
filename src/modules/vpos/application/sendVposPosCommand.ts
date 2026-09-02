import type { PosCommandRequest } from '@/src/modules/pos/contracts/commands'

import {
  dispatchVposPosCommand,
  isValidVposPosCommandType,
} from '@/src/modules/vpos/application/pos'

export function prepareVposPosCommand(body: Record<string, unknown>) {
  const type = body?.type
  if (!isValidVposPosCommandType(type)) {
    return {
      ok: false as const,
      error:
        'Invalid command type. Expected one of: POS_STATUS, COMPLETE_TRANSACTION, CAPTURE_CUSTOMER_DETAILS, CLEAR_CUSTOMER_DETAILS, GET_DAILY_DATA, PING',
    }
  }

  return {
    ok: true as const,
    value: {
      type,
      payload: 'payload' in body ? (body as any).payload : undefined,
    } satisfies PosCommandRequest,
  }
}

export async function sendVposPosCommand(args: {
  stationId: string
  command: PosCommandRequest
}) {
  if (!args.stationId) throw new Error('stationId is required')
  return await dispatchVposPosCommand(args.stationId, args.command)
}

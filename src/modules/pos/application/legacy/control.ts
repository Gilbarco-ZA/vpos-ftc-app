import { legacyPosAck } from '@/src/shared/vpos/legacyPosApi'

import { sendPosCommand } from '@/src/modules/pos/application/posControlClient'
import { enqueuePosPrintJob } from '@/src/modules/pos/application/posProxy'

export type PosControlRouteCommand =
  | 'attendantAuth'
  | 'clearFpError'
  | 'clearPreFuelCustomer'
  | 'closeFps'
  | 'openFps'
  | 'preFuelCustomer'
  | 'print'

const POS_CONTROL_TYPES: Record<
  Exclude<PosControlRouteCommand, 'print'>,
  string
> = {
  attendantAuth: 'ATTENDANT_AUTH',
  clearFpError: 'CLEAR_FP_ERROR',
  clearPreFuelCustomer: 'CLEAR_PREFUEL_CUSTOMER',
  closeFps: 'CLOSE_FPS',
  openFps: 'OPEN_FPS',
  preFuelCustomer: 'PREFUEL_CUSTOMER',
}

export async function executePosControlCommand(
  stationId: string,
  command: PosControlRouteCommand,
  body: Record<string, unknown>,
) {
  if (command === 'print') {
    await enqueuePosPrintJob(stationId, body)
    return legacyPosAck('print')
  }

  const result = await sendPosCommand(stationId, {
    type: POS_CONTROL_TYPES[command] as any,
    payload: body,
  })

  if ((result as any)?.ok === false) {
    throw Object.assign(
      new Error(
        (result as any)?.error ??
          (result as any)?.message ??
          `POS ${command} command failed`,
      ),
      {
        code: (result as any)?.code ?? 'POS_COMMAND_FAILED',
        status: (result as any)?.status ?? 502,
        details: result,
      },
    )
  }

  return legacyPosAck(command)
}

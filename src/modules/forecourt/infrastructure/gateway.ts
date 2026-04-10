import type { ForecourtCommand } from '@/src/shared/forecourt/types'

import {
  ensureGatewayStarted as ensureGatewayStartedShared,
  sendForecourtCommand as sendForecourtCommandShared,
} from '@/src/shared/forecourt/gateway'

export function ensureGatewayStarted() {
  ensureGatewayStartedShared()
}

export async function sendForecourtCommand(command: ForecourtCommand) {
  return await sendForecourtCommandShared(command)
}

import type { ForecourtCommand } from '@/src/shared/forecourt/types'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import {
  ensureGatewayStarted as ensureGatewayStartedImpl,
  sendForecourtCommand as sendForecourtCommandImpl,
} from './core/gateway'

export function ensureGatewayStarted() {
  ensureGatewayStartedImpl()
}

export async function sendForecourtCommand(cmd: ForecourtCommand) {
  if (!cmd || typeof cmd !== 'object') throw new Error('command is required')
  requireNonEmptyString((cmd as any).stationId, 'stationId')
  requireNonEmptyString((cmd as any).command ?? (cmd as any).action, 'command')
  return await sendForecourtCommandImpl({
    ...(cmd as any),
    issuedAt: (cmd as any).issuedAt ?? Date.now(),
  } as any)
}

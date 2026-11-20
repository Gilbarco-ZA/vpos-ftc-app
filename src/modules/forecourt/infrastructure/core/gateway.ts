import type {
  ForecourtCommand,
  SharedForecourtCommandPayload,
} from '@/src/shared/forecourt/types'

import {
  sendJplTcpCommand,
  startJplTcpAdapter,
} from '@/src/modules/forecourt/infrastructure/jpl/adapter'
import { subscribeForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'

declare global {
  var __forecourtGatewayStarted: boolean | undefined
  var __forecourtGatewayConfigUnsubscribe: (() => void) | undefined
}

const toSharedPayload = (
  cmd: ForecourtCommand,
): SharedForecourtCommandPayload => ({
  ...cmd.payload,
  pumpNumber: cmd.pumpNumber,
  nozzleNumber: cmd.nozzleNumber,
  stationId: cmd.stationId,
  idempotencyKey: cmd.id,
})

// Forecourt connectivity may be temporarily unavailable while an earlier POS
// lease expires. Never let a fire-and-forget startup reject the web process.
const startGatewayAdapter = () => {
  void startJplTcpAdapter().catch((error) => {
    logger.warn('[forecourtGateway] JPL adapter start deferred', {
      error: serializeError(error),
    })
  })
}

export const ensureGatewayStarted = () => {
  if (globalThis.__forecourtGatewayStarted) return
  globalThis.__forecourtGatewayStarted = true

  startGatewayAdapter()

  if (!globalThis.__forecourtGatewayConfigUnsubscribe) {
    globalThis.__forecourtGatewayConfigUnsubscribe =
      subscribeForecourtRuntimeConfig(() => {
        startGatewayAdapter()
      })
  }
}

export const sendForecourtCommand = async (cmd: ForecourtCommand) => {
  return await sendJplTcpCommand(cmd.action, toSharedPayload(cmd))
}

export const isForecourtLegacyModeEnabled = () => false

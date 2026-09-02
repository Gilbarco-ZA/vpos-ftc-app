import type {
  ForecourtCommand,
  SharedForecourtCommandPayload,
} from '@/src/shared/forecourt/types'

import {
  sendJplTcpCommand,
  startJplTcpAdapter,
} from '@/src/modules/forecourt/infrastructure/jpl/adapter'
import { subscribeForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

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

export const ensureGatewayStarted = () => {
  if (globalThis.__forecourtGatewayStarted) return
  globalThis.__forecourtGatewayStarted = true

  void startJplTcpAdapter()

  if (!globalThis.__forecourtGatewayConfigUnsubscribe) {
    globalThis.__forecourtGatewayConfigUnsubscribe =
      subscribeForecourtRuntimeConfig(() => {
        void startJplTcpAdapter()
      })
  }
}

export const sendForecourtCommand = async (cmd: ForecourtCommand) => {
  return await sendJplTcpCommand(cmd.action, toSharedPayload(cmd))
}

export const isForecourtLegacyModeEnabled = () => false

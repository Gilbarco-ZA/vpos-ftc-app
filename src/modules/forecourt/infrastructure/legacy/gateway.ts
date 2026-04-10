import type {
  ForecourtCommand,
  SharedForecourtCommandPayload,
} from '@/src/shared/forecourt/types'

import {
  sendSimTcpCommand,
  startSimTcpNdjsonAdapter,
} from '@/src/modules/forecourt/infrastructure/legacy/simTcpNdjsonAdapter'

export const isLegacyForecourtMode = (mode: string) => mode === 'sim_tcp'

export const startLegacyForecourtAdapter = async (mode: string) => {
  if (mode === 'sim_tcp') {
    startSimTcpNdjsonAdapter()
  }
}

export const sendLegacyForecourtCommand = async (
  mode: string,
  cmd: ForecourtCommand,
  payload: SharedForecourtCommandPayload,
) => {
  if (mode === 'sim_tcp') {
    return await sendSimTcpCommand(cmd.action, payload)
  }

  throw new Error(`Unsupported legacy forecourt mode: ${mode}`)
}

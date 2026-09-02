import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/jpl/types'
import type { JplAccessMode } from '@/src/shared/integrations/jplAccess'

export type JplClientRuntimeDeps = {
  assertAccessAllowed: (
    stationId: string,
    accessMode?: JplAccessMode,
  ) => Promise<unknown>
  getGatewayState: () => any
  ensureGatewayStarted: () => Promise<unknown>
  getClient: () => any
  getConfig: (stationId: string) => Promise<any>
  getReplayStatus: (stationId: string) => Promise<any>
  enqueueCommand?: <T>(task: () => Promise<T>) => Promise<T>
}

export type JplCommandContext = {
  stationId: string
  cmd: PosCommand
  client: any
  timeoutMs: number
  posId: string
  fpOperationModeNo: number
  runtime: JplClientRuntimeDeps
}

export type JplCommandHandlerResult = PosCommandResult | null

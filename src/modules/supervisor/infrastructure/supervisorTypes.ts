import type {
  getRuntimeState,
  setRuntimeState,
} from '@/src/modules/runtime/infrastructure/runtimeState'
import type { query } from '@/src/platform/db/postgres'
import type { getSystemConfiguration } from '@/src/shared/config/loader'
import type { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export type SupervisorCommandType =
  | 'RESTART_PROCESS'
  | 'STOP_PROCESS'
  | 'START_PROCESS'
  | 'GET_STATUS'

export type SupervisorCommand = {
  type: SupervisorCommandType
  processName?: string
  options?: Record<string, unknown>
}

export type SupervisorProcessStatus = {
  status: unknown
  pid?: number
  uptime: number
  lastHealthCheck?: number
  connected: boolean
  metrics: any | null
  lastError?: string
  restartCount: number
}

export type SupervisorStatus = {
  processes: Record<string, SupervisorProcessStatus | undefined>
  uptime: number
  timestamp: number
  system?: {
    uptime: number
    loadAvg: number[]
    freeMemory: number
    totalMemory: number
    cpuUsage: number
  }
  folders?: Record<string, unknown>
  storage?: unknown[]
  optional?: any
}

export type ProcessOverride = {
  status?: string
  lastHealthCheck?: number
  connected?: boolean
  lastError?: string
  restartCount?: number
}

export type SupervisorRuntimeDeps = {
  query?: typeof query
  kvGet?: typeof kvGet
  kvSet?: typeof kvSet
  getSystemConfiguration?: typeof getSystemConfiguration
  getRuntimeState?: typeof getRuntimeState
  setRuntimeState?: typeof setRuntimeState
  withLock?: <T>(key: string, fn: () => Promise<T>) => Promise<T>
}

export const PROCESS_OVERRIDES_KEY = 'vpos.supervisor.processes'
export const SUPERVISOR_META_KEY = 'vpos.supervisor.meta'

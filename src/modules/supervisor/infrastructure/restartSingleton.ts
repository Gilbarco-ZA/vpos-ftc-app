import { logger } from '@/src/shared/utils/logger'

import { RestartManager } from './restartManager'

const g = globalThis as any
if (!g.__vposRestartManagers)
  g.__vposRestartManagers = new Map<string, RestartManager>()

export function getRestartManager(stationId: string) {
  const map: Map<string, RestartManager> = g.__vposRestartManagers
  let m = map.get(stationId)
  if (!m) {
    m = new RestartManager(stationId)
    m.start().catch((e) =>
      logger.error('[RestartManager]', { msg: 'start error', error: e }),
    )
    map.set(stationId, m)
  }
  return m
}

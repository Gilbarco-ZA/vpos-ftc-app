import {
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/shared/forecourt/jplState'
import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'

import { listForecourtLiveEvents as listForecourtLiveEventsImpl } from '@/src/modules/forecourt/infrastructure/jpl/liveEvents'
import {
  getForecourtRuntimeConfig as getForecourtRuntimeConfigImpl,
  loadForecourtRuntimeConfigFromDb as loadForecourtRuntimeConfigFromDbImpl,
  subscribeForecourtRuntimeConfig as subscribeForecourtRuntimeConfigImpl,
} from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export function getForecourtRuntimeConfig() {
  return getForecourtRuntimeConfigImpl()
}

export async function loadForecourtRuntimeConfigFromDb(stationId: string) {
  return await loadForecourtRuntimeConfigFromDbImpl(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export function subscribeForecourtRuntimeConfig(
  listener: (cfg: ReturnType<typeof getForecourtRuntimeConfigImpl>) => void,
) {
  return subscribeForecourtRuntimeConfigImpl((cfg) => listener(cfg))
}

export { getJplAdapterState, getJplBufferHealth }

export function getDomsDebugEvents(limit?: number) {
  return listForecourtLiveEventsImpl(toPositiveInt(limit, 100, 1000))
}

export function startForecourtRuntimeConfigWatcher(stationId: string) {
  const stop = subscribeForecourtRuntimeConfigImpl(() => {})
  void loadForecourtRuntimeConfigFromDbImpl(stationId).catch(() => {})
  return stop
}

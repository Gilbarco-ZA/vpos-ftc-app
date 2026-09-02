import { summarizeJplAdapterState } from '@/src/shared/forecourt/jplState'
import { toPositiveInt } from '@/src/shared/utils/inputs'

import {
  getDomsDebugEvents,
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/modules/forecourt/application/forecourtRuntime'

export function getForecourtAdapterDiagnostics() {
  return {
    adapterState: summarizeJplAdapterState(getJplAdapterState()),
    bufferHealth: getJplBufferHealth(),
  }
}

/**
 * Full in-process adapter state is reserved for an explicitly requested
 * support bundle. Routine admin/readiness endpoints must use the bounded
 * diagnostics projection above so merely opening /admin/forecourt does not
 * stringify the complete controller payload cache.
 */
export function getForecourtAdapterRuntimeDiagnostics() {
  return {
    adapterState: getJplAdapterState(),
    bufferHealth: getJplBufferHealth(),
  }
}

export function listForecourtLiveEvents(limit: number) {
  return getDomsDebugEvents(toPositiveInt(limit, 100, 1000))
}

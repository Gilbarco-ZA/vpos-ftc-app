import {
  getDomsDebugEvents,
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/shared/forecourt/runtime'
import { toPositiveInt } from '@/src/shared/utils/inputs'

export function getForecourtAdapterDiagnostics() {
  return {
    adapterState: getJplAdapterState(),
    bufferHealth: getJplBufferHealth(),
  }
}

export function listForecourtLiveEvents(limit: number) {
  return getDomsDebugEvents(toPositiveInt(limit, 100, 1000))
}

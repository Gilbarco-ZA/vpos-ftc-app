import { summarizeJplAdapterState } from '@/src/shared/forecourt/jplState'

import {
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/modules/forecourt/application/forecourtRuntime'

export function getJplTcpAdapterState() {
  return getJplAdapterState()
}

export function getJplTcpAdapterStateSummary() {
  return summarizeJplAdapterState(getJplAdapterState())
}

export function getJplTcpBufferHealth() {
  return getJplBufferHealth()
}

import {
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/shared/forecourt/runtime'

export function getJplTcpAdapterState() {
  return getJplAdapterState()
}

export function getJplTcpBufferHealth() {
  return getJplBufferHealth()
}

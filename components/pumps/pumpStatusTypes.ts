import type { BufferSeverity, SimPumpState } from '@/src/shared/status/ui'

export type { ForecourtConnectionPayload } from '@/src/modules/forecourt/types'

export type { BufferSeverity }

export type SimPump = {
  id: number
  online: boolean
  authorized: boolean
  state: SimPumpState
  gradeSelected: 1 | 2 | 3 | null
}

export type SimSnapshot = {
  pumps: SimPump[]
}

export type PumpBufferHealth = {
  pumpId: number
  depth: number
  lastSeqNo: number | null
  lastStatusAt: number | null
  lastReadAt: number | null
  lastClearAt: number | null
  lastError?: string
}

export type BufferThresholds = {
  bufferWarnDepthSup: number
  bufferCritDepthSup: number
  bufferWarnAgeMinSup: number
  bufferCritAgeMinSup: number
  bufferWarnDepthUnsup: number
  bufferCritDepthUnsup: number
  bufferWarnAgeMinUnsup: number
  bufferCritAgeMinUnsup: number
}

export type ForecourtBufferPayload = {
  stationId: string
  updatedAt: number
  supervised: PumpBufferHealth[]
  unsupervised: PumpBufferHealth[]
  thresholds?: Partial<BufferThresholds>
}

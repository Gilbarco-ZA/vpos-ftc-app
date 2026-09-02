export type BufferMode = 'supervised' | 'unsupervised'

export type PumpBufferHealth = {
  pumpId: number
  depth: number
  lastSeqNo: number | null
  lastStatusAt: number | null
  lastReadAt: number | null
  lastClearAt: number | null
  lastError?: string
}

export type BufferHealthState = {
  updatedAt: number
  supervised: Record<string, PumpBufferHealth>
  unsupervised: Record<string, PumpBufferHealth>
}

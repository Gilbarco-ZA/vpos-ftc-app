export type ForecourtCommand = {
  id: string
  stationId: string
  pumpNumber: number
  nozzleNumber?: number
  action: string
  payload: Record<string, unknown>
  issuedAt: number
  command?: string
}

export type ForecourtCommandAck = {
  id: string
  stationId: string
  pumpNumber: number
  nozzleNumber?: number
  status: 'accepted' | 'rejected'
  reason?: string
  timestamp: number
}

export type ForecourtCommandResult = {
  id: string
  stationId: string
  pumpNumber: number
  nozzleNumber?: number
  status: 'completed' | 'failed' | 'timeout'
  error?: string
  timestamp: number
}

export type SharedForecourtCommandPayload = {
  pumpNumber: number
  nozzleNumber?: number
  stationId: string
  idempotencyKey: string
} & Record<string, unknown>

export type AdapterState = {
  connected: boolean
  loggedOn?: boolean
  secureMode?: boolean
  reconnectAttempts: number
  lastConnectAt?: number
  lastMessageAt?: number
  lastRequestAt?: number
  lastHeartbeatSentAt?: number
  lastHeartbeatAt?: number
  heartbeatIntervalMs?: number
  deadConnectionTimeoutMs?: number
  welcomeVersion?: string
  lastCorrelationId?: string
  lastReject?: {
    code?: string
    kind?: string
    info?: string
    correlationId?: string
    at: number
  }
  lastError?: string
  posId?: string
  nextReconnectAt?: number
  lastDisconnectReason?: string
  lastLifecycleEventAt?: number
  lastFcStatus?: any
  lastPosConnectionStatus?: any
  lastPssPeripheralsStatus?: any
  lastInstallStatus?: any
  lastServiceMessages?: Array<{ seqNo?: string; message?: string; at: number }>
}

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

export type NozzleMapping = {
  nozzleId: string
  nozzleNumber: number
  fuelType?: string | null
  productCode?: string | null
}

export type PumpMapping = {
  pumpNumber: number
  nozzles: NozzleMapping[]
}

export type PumpMappingsCache = {
  stationId: string
  loadedAt: number
  map: Map<number, PumpMapping>
}

export type NormalizedTransactionResult = {
  sourceMode: BufferMode
  pumpNumber: number
  transSeqNo: number
  lockId: string | number | null
  persisted: boolean
  dedupedInProcess?: boolean
}

export type JplReplayEntry = {
  fpId?: number | null
  transSeqNo?: number | null
  transLockId?: string | number | null
}

export type SupervisedReplayStage =
  | 'discovered'
  | 'read_locked'
  | 'captured'
  | 'cleared'

export type SupervisedReplayRow = {
  station_id: string
  fp_id: number
  trans_seq_no: number
  replay_stage: SupervisedReplayStage
  lock_id: string | null
  read_payload_json: any | null
  clear_fields_json: any | null
  captured_at: string | null
  cleared_at: string | null
  last_error: string | null
  updated_at: string
}

export type ReplayRejectKind =
  | 'none'
  | 'access_denied'
  | 'already_locked'
  | 'other'

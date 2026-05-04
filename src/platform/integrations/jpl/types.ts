export type JplConfig = {
  host: string
  /** APC base ports are inferred from doms-pos-jpl; override if you run a non-standard stack. */
  portOverrides?: Partial<Record<'apc1' | 'apc2', number>>
  appId: string
  accessCode?: string
  countryCode: string
  enabledApcs?: Array<'apc1' | 'apc2'>
  /** POS identifier used in forecourt commands (e.g., open/authorize). */
  posId?: number
  /** Default FP operation mode number for open_Fp requests. */
  fpOperationModeNo?: number
  /** Socket/login + request/response timeout. */
  timeoutMs?: number
}

export type JplFpErrorSnapshot = {
  fpId?: string
  subCode?: string
  normalized?: any
  payload?: any
  at: number
}

export type JplPumpErrorDiagnostic = {
  fpId?: string
  errorCode?: string
  errorName?: string
  occurredAt?: string
  pumpProtocolId?: string
  pumpErrorCode?: string
  severity?: 'warning' | 'error'
  category?: string
  operatorMessage?: string
  recommendedAction?: string
  needsAdminIntervention?: boolean
}

export type JplTransactionCheckpoint = {
  sourceMode: 'supervised' | 'unsupervised'
  fpId: number
  transSeqNo: number
  lifecycleStage?: string
  lockId?: string | null
  ownerPosId?: string | null
  blockedByForeignPos?: boolean
  readAttempts?: number
  clearAttempts?: number
  updatedAt?: string
  lastError?: string | null
}

export type JplBufferSeverity = 'ok' | 'warn' | 'critical'

export type JplBufferEntrySummary = {
  pumpId: number
  depth: number
  lastSeqNo: number | null
  lastStatusAt: number | null
  lastReadAt: number | null
  lastClearAt: number | null
  ageMinutes: number | null
  severity: JplBufferSeverity
  reasons: string[]
  lastError?: string
}

export type JplBufferAlert = {
  mode: 'supervised' | 'unsupervised'
  pumpId: number
  severity: Exclude<JplBufferSeverity, 'ok'>
  reasons: string[]
}

export type JplBufferHealthSummary = {
  updatedAt?: number
  supervised: JplBufferEntrySummary[]
  unsupervised: JplBufferEntrySummary[]
  totals: {
    supervisedDepth: number
    unsupervisedDepth: number
    supervisedPumps: number
    unsupervisedPumps: number
  }
}

export type JplReplayCapability = 'unknown' | 'allowed' | 'denied'

export type JplPendingReplayClear = {
  fpId: number
  transSeqNo: number
  replayStage?: string
  lockId?: string | null
  updatedAt?: string
  lastError?: string | null
}

export type JplHealth = {
  ok: boolean
  provider: 'JPL'
  host: string
  apcs: Record<string, { connected: boolean; loggedOn: boolean }>
  version?: string
  secureMode?: boolean
  posId?: string
  lastMessageAt?: number
  lastHeartbeatAt?: number
  nextReconnectAt?: number
  lastDisconnectReason?: string
  error?: string
  controllerStatus?: any
  posConnectionStatus?: any
  peripheralsStatus?: any
  installStatus?: any
  pumpStatuses?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  fpInfo?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  fuellingData?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  tankStatuses?: Array<{
    tgId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  siteDeliveryStatus?: {
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }
  tankDeliveryData?: Array<{
    tgId?: string
    deliveryReportSeqNo?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  fpErrors?: JplFpErrorSnapshot[]
  serviceMessages?: Array<{ seqNo?: string; message?: string; at: number }>
  backOfficeRecords?: Array<{
    seqNo?: string
    formatId?: string
    subCode?: string
    payload?: any
    at: number
  }>
  activePumpStatuses?: Array<{
    fpId?: string
    mainState?: string
    nozzleState?: string
    lockId?: string
    gradeId?: string
    nozzleNumber?: number | null
    flags?: Record<string, boolean>
    at?: number
  }>
  tankAlerts?: Array<{
    tgId?: string
    mainState?: string
    flags?: Record<string, boolean>
    alarms?: Record<string, boolean>
    at?: number
  }>
  bufferHealth?: JplBufferHealthSummary
  bufferAlerts?: JplBufferAlert[]
  controllerFlags?: {
    serviceMessageReady?: boolean
    backOfficeRecordExists?: boolean
    rtcError?: boolean
    fallbackMode?: boolean
    storedTransactionsDisabled?: boolean
    hardwareSoftwareIncompatibility?: boolean
  }
  onlinePeerConnections?: Array<{
    deviceType?: string
    address?: number | string
    port?: number | string
  }>
  peripheralAlerts?: Array<{
    peripheralType?: string
    address?: number | string
    port?: number | string
    status?: string[]
  }>
  pumpErrorDiagnostics?: JplPumpErrorDiagnostic[]
  replayCapabilities?: {
    supervised: JplReplayCapability
    unsupervised: JplReplayCapability
  }
  pendingReplayClears?: JplPendingReplayClear[]
  transactionCheckpoints?: JplTransactionCheckpoint[]
}

export type PosCommand =
  | { type: 'PING' }
  | { type: 'POS_STATUS' }
  | { type: 'COMPLETE_TRANSACTION'; payload?: any }
  | { type: 'GET_SUPERVISED_TRANSACTION'; payload?: any }
  | { type: 'CLEAR_SUPERVISED_TRANSACTION'; payload?: any }
  | { type: 'UNLOCK_SUPERVISED_TRANSACTION'; payload?: any }
  | { type: 'GET_UNSUPERVISED_TRANSACTION'; payload?: any }
  | { type: 'CLEAR_UNSUPERVISED_TRANSACTION'; payload?: any }
  | { type: 'UNLOCK_UNSUPERVISED_TRANSACTION'; payload?: any }
  | { type: 'GET_REPLAY_STATUS'; payload?: any }
  | { type: 'CANCEL_TRANSACTION'; payload?: any }
  | { type: 'CAPTURE_CUSTOMER_DETAILS'; payload?: any }
  | { type: 'CLEAR_CUSTOMER_DETAILS'; payload?: any }
  | { type: 'OPEN_SHIFT'; payload?: any }
  | { type: 'CLOSE_SHIFT'; payload?: any }
  | { type: 'OPEN_FPS'; payload?: any }
  | { type: 'CLOSE_FPS'; payload?: any }
  | { type: 'ATTENDANT_AUTH'; payload?: any }
  | { type: 'PREFUEL_CUSTOMER'; payload?: any }
  | { type: 'PRESET_FUEL_AUTH'; payload?: any }
  | { type: 'EXTENDED_FUEL_AUTH'; payload?: any }
  | { type: 'PREPARE_TRANSACTION'; payload?: any }
  | { type: 'CLEAR_PREFUEL_CUSTOMER'; payload?: any }
  | { type: 'GET_FP_STATUS'; payload?: any }
  | { type: 'GET_FP_INFO'; payload?: any }
  | { type: 'GET_FP_FUELLING_DATA'; payload?: any }
  | { type: 'GET_FP_ERROR'; payload?: any }
  | { type: 'GET_GRADE_PRICES'; payload?: any }
  | { type: 'CHANGE_GRADE_PRICES'; payload?: any }
  | { type: 'GET_ALL_TANK_DELIVERY_DATA'; payload?: any }
  | { type: 'GET_TANK_DELIVERY_DATA'; payload?: any }
  | { type: 'CLEAR_TANK_DELIVERY_DATA'; payload?: any }
  | { type: 'GET_ALL_TG_DATA'; payload?: any }
  | { type: 'GET_TG_STATUS'; payload?: any }
  | { type: 'GET_SITE_DELIVERY_STATUS'; payload?: any }
  | { type: 'OPEN_TANK_CONTROLLER'; payload?: any }
  | { type: 'CLOSE_TANK_CONTROLLER'; payload?: any }
  | { type: 'START_DELIVERY_PROCESS'; payload?: any }
  | { type: 'STOP_DELIVERY_PROCESS'; payload?: any }
  | { type: 'GET_TRANSACTION_BUFFER_STATUS'; payload?: any }
  | { type: 'CHANGE_DYNAMIC_TANK_DATA'; payload?: any }
  | { type: 'GET_TG_ERROR_MSG'; payload?: any }
  | { type: 'CLEAR_FP_ERROR'; payload?: any }
  | { type: 'ESTOP_FP'; payload?: any }
  | { type: 'CANCEL_FP_ESTOP'; payload?: any }
  | { type: 'RESET_FP'; payload?: any }
  | { type: 'GET_FC_STATUS'; payload?: any }
  | { type: 'GET_POS_CONNECTION_STATUS'; payload?: any }
  | { type: 'GET_PSS_PERIPHERALS_STATUS'; payload?: any }
  | { type: 'GET_FC_SERVICE_LOG'; payload?: any }
  | { type: 'CLEAR_FC_SERVICE_LOG'; payload?: any }
  | { type: 'GET_BACK_OFFICE_RECORD'; payload?: any }
  | { type: 'CLEAR_BACK_OFFICE_RECORD'; payload?: any }
  | { type: string; payload?: any }

export type PosCommandResult = {
  ok: boolean
  accepted?: boolean
  message?: string
  data?: any
  error?: string
  controllerStatus?: any
  posConnectionStatus?: any
  peripheralsStatus?: any
  installStatus?: any
  pumpStatuses?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  fpInfo?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  fuellingData?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  tankStatuses?: Array<{
    tgId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  siteDeliveryStatus?: {
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }
  tankDeliveryData?: Array<{
    tgId?: string
    deliveryReportSeqNo?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  fpErrors?: JplFpErrorSnapshot[]
  serviceMessages?: Array<{ seqNo?: string; message?: string; at: number }>
  backOfficeRecords?: Array<{
    seqNo?: string
    formatId?: string
    subCode?: string
    payload?: any
    at: number
  }>
  activePumpStatuses?: Array<{
    fpId?: string
    mainState?: string
    nozzleState?: string
    lockId?: string
    gradeId?: string
    nozzleNumber?: number | null
    flags?: Record<string, boolean>
    at?: number
  }>
  tankAlerts?: Array<{
    tgId?: string
    mainState?: string
    flags?: Record<string, boolean>
    alarms?: Record<string, boolean>
    at?: number
  }>
  bufferHealth?: JplBufferHealthSummary
  bufferAlerts?: JplBufferAlert[]
  controllerFlags?: {
    serviceMessageReady?: boolean
    backOfficeRecordExists?: boolean
    rtcError?: boolean
    fallbackMode?: boolean
    storedTransactionsDisabled?: boolean
    hardwareSoftwareIncompatibility?: boolean
  }
  onlinePeerConnections?: Array<{
    deviceType?: string
    address?: number | string
    port?: number | string
  }>
  peripheralAlerts?: Array<{
    peripheralType?: string
    address?: number | string
    port?: number | string
    status?: string[]
  }>
  pumpErrorDiagnostics?: JplPumpErrorDiagnostic[]
  replayCapabilities?: {
    supervised: JplReplayCapability
    unsupervised: JplReplayCapability
  }
  pendingReplayClears?: JplPendingReplayClear[]
  transactionCheckpoints?: JplTransactionCheckpoint[]
}

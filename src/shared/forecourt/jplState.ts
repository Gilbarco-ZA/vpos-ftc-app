export type JplTcpAdapterState = {
  connected: boolean
  loggedOn?: boolean
  secureMode?: boolean
  reconnectAttempts: number
  lastMessageAt?: number
  lastConnectAt?: number
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
  } | null
  lastFrameDiagnostic?: {
    valid: boolean
    code: string
    message: string
    byteLength: number
    hasStx: boolean
    hasEtx: boolean
    stxIndex: number
    etxIndex: number
    preview: string
    name?: string
    subCode?: string
    solicited?: boolean
    correlationId?: unknown
    at: number
  }
  frameDiagnostics?: Array<{
    valid: boolean
    code: string
    message: string
    byteLength: number
    hasStx: boolean
    hasEtx: boolean
    stxIndex: number
    etxIndex: number
    preview: string
    name?: string
    subCode?: string
    solicited?: boolean
    correlationId?: unknown
    at: number
  }>
  lastError?: string
  posId?: string
  nextReconnectAt?: number
  lastDisconnectReason?: string
  lastLifecycleEventAt?: number
  lastFcStatus?: any
  lastPosConnectionStatus?: any
  lastPssPeripheralsStatus?: any
  lastInstallStatus?: any
  lastFpStatuses?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastFpInfo?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastFpFuellingData?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastFpErrors?: Array<{
    fpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastTgStatuses?: Array<{
    tgId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastTgData?: Array<{
    tgId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastSiteDeliveryStatus?: {
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }
  lastTankDeliveryData?: Array<{
    tgId?: string
    deliveryReportSeqNo?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastServiceMessages?: Array<{ seqNo?: string; message?: string; at: number }>

  lastPpStatuses?: Array<{
    ppId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastPpErrors?: Array<{
    ppId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastWashStatuses?: Array<{
    wpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastWashErrors?: Array<{
    wpId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastWashTransactions?: Array<{
    wpId?: string
    transSeqNo?: string
    sourceHash?: string
    source?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastDigitalIoStatuses?: Array<{
    diopId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastSensorStatuses?: Array<{
    sensorId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastVendingStatuses?: Array<{
    vmId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastVendingErrors?: Array<{
    vmId?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastVendingTotals?: Array<{
    vmId?: string
    vmTotalType?: string
    vmTotalTypeLabel?: string
    sourceHash?: string
    subCode?: string
    normalized?: any
    payload?: any
    at: number
  }>
  lastBackOfficeRecords?: Array<{
    seqNo?: string
    formatId?: string
    subCode?: string
    payload?: any
    at: number
  }>
}

export type JplTcpBufferHealth = {
  updatedAt?: number
  supervised: Record<string, any>
  unsupervised: Record<string, any>
}

type GlobalsShape = {
  adapterState: JplTcpAdapterState
  bufferHealth: JplTcpBufferHealth
}

const GLOBAL_KEY = '__VPOS_JPL_TCP_GLOBALS__'

function ensureGlobals(): GlobalsShape {
  const g = globalThis as any
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      adapterState: { connected: false, reconnectAttempts: 0 },
      bufferHealth: { updatedAt: undefined, supervised: {}, unsupervised: {} },
    } satisfies GlobalsShape
  }
  return g[GLOBAL_KEY] as GlobalsShape
}

export function getJplGlobals() {
  return ensureGlobals()
}

export function setJplAdapterState(next: Partial<JplTcpAdapterState>) {
  const globals = ensureGlobals()
  globals.adapterState = { ...globals.adapterState, ...next }
}

export function getJplAdapterState(): JplTcpAdapterState {
  return ensureGlobals().adapterState
}

export function setJplBufferHealth(next: Partial<JplTcpBufferHealth>) {
  const globals = ensureGlobals()
  globals.bufferHealth = { ...globals.bufferHealth, ...next }
}

export function getJplBufferHealth(): JplTcpBufferHealth {
  return ensureGlobals().bufferHealth
}

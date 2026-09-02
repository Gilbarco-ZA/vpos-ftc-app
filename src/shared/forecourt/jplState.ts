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
  lastWireDiagnostic?: any
  wireDiagnostics?: any[]

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

const takeRecent = <T>(items: T[] | undefined, limit: number): T[] => {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.slice(Math.max(0, items.length - limit))
}

/**
 * Build the bounded adapter snapshot used by admin/readiness endpoints and
 * routine logs. The live adapter keeps richer controller payloads in-process,
 * but serialising that entire object on every admin page load can temporarily
 * duplicate tens of kilobytes of nested pump/tank payloads and block the event
 * loop while JSON is produced.
 */
export function summarizeJplAdapterState(
  state: JplTcpAdapterState = getJplAdapterState(),
) {
  const dynamicState = state as JplTcpAdapterState & Record<string, unknown>

  return {
    connected: Boolean(state.connected),
    loggedOn: state.loggedOn ?? null,
    secureMode: state.secureMode ?? null,
    reconnectAttempts: Number(state.reconnectAttempts ?? 0),
    lastMessageAt: state.lastMessageAt ?? null,
    lastConnectAt: state.lastConnectAt ?? null,
    lastRequestAt: state.lastRequestAt ?? null,
    lastHeartbeatSentAt: state.lastHeartbeatSentAt ?? null,
    lastHeartbeatAt: state.lastHeartbeatAt ?? null,
    heartbeatIntervalMs: state.heartbeatIntervalMs ?? null,
    deadConnectionTimeoutMs: state.deadConnectionTimeoutMs ?? null,
    welcomeVersion: state.welcomeVersion ?? null,
    protocolVersion: dynamicState.protocolVersion ?? null,
    correlationSupport: dynamicState.correlationSupport ?? null,
    correlationCapability: dynamicState.correlationCapability ?? null,
    requestDispatchPolicy: dynamicState.requestDispatchPolicy ?? null,
    requestDispatchMode: dynamicState.requestDispatchMode ?? null,
    requestMode: dynamicState.requestMode ?? null,
    lastCorrelationId: state.lastCorrelationId ?? null,
    lastReject: state.lastReject ?? null,
    lastError: state.lastError ?? null,
    posId: state.posId ?? null,
    nextReconnectAt: state.nextReconnectAt ?? null,
    lastDisconnectReason: state.lastDisconnectReason ?? null,
    lastLifecycleEventAt: state.lastLifecycleEventAt ?? null,
    status: dynamicState.status ?? null,
    connectionStatus: dynamicState.connectionStatus ?? null,
    protocol: dynamicState.protocol ?? null,
    protocolHealth: dynamicState.protocolHealth ?? null,
    controllerFlags: dynamicState.controllerFlags ?? null,
    lastFrameDiagnostic: state.lastFrameDiagnostic ?? null,
    frameDiagnostics: takeRecent(state.frameDiagnostics, 10),
    lastWireDiagnostic: state.lastWireDiagnostic ?? null,
    wireDiagnostics: takeRecent(state.wireDiagnostics, 10),
    runtimeCounts: {
      fpStatuses: state.lastFpStatuses?.length ?? 0,
      fpInfo: state.lastFpInfo?.length ?? 0,
      fpFuellingData: state.lastFpFuellingData?.length ?? 0,
      fpErrors: state.lastFpErrors?.length ?? 0,
      tankStatuses: state.lastTgStatuses?.length ?? 0,
      tankData: state.lastTgData?.length ?? 0,
      tankDeliveries: state.lastTankDeliveryData?.length ?? 0,
      serviceMessages: state.lastServiceMessages?.length ?? 0,
      backOfficeRecords: state.lastBackOfficeRecords?.length ?? 0,
      paymentStatuses: state.lastPpStatuses?.length ?? 0,
      paymentErrors: state.lastPpErrors?.length ?? 0,
      washStatuses: state.lastWashStatuses?.length ?? 0,
      washErrors: state.lastWashErrors?.length ?? 0,
      washTransactions: state.lastWashTransactions?.length ?? 0,
      digitalIoStatuses: state.lastDigitalIoStatuses?.length ?? 0,
      sensorStatuses: state.lastSensorStatuses?.length ?? 0,
      vendingStatuses: state.lastVendingStatuses?.length ?? 0,
      vendingErrors: state.lastVendingErrors?.length ?? 0,
      vendingTotals: state.lastVendingTotals?.length ?? 0,
    },
  }
}

export function setJplBufferHealth(next: Partial<JplTcpBufferHealth>) {
  const globals = ensureGlobals()
  globals.bufferHealth = { ...globals.bufferHealth, ...next }
}

export function getJplBufferHealth(): JplTcpBufferHealth {
  return ensureGlobals().bufferHealth
}

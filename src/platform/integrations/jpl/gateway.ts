import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type { ProtocolHealthPayload } from '@/src/modules/forecourt/infrastructure/jpl/protocolHealth'
import type {
  JplBufferAlert,
  JplBufferEntrySummary,
  JplBufferHealthSummary,
  JplBufferSeverity,
} from '@/src/platform/integrations/jpl/types'
import type {
  RequestDispatchMode,
  RequestDispatchPolicy,
} from '@/src/shared/forecourt/runtimeConfig'
import type { JplClient } from '@gilbarcoafs/doms-pos-jpl'

import { mapJplMainState } from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import {
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/shared/forecourt/jplState'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtimeConfig'

import { enumLabel } from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'
import { buildProtocolHealth } from '@/src/modules/forecourt/infrastructure/jpl/protocolHealth'
import { getReplayCapabilities } from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import { resolveStationId } from '@/src/modules/forecourt/infrastructure/jpl/station'

let cachedStationId: string | null = null

const resolveRequestDispatchPolicy = (
  client: JplClient | null,
): RequestDispatchPolicy => {
  const candidate = (client as any)?.opts?.requestDispatchPolicy
  if (
    candidate === 'correlation-required' ||
    candidate === 'auto' ||
    candidate === 'strict-single-flight-when-uncorrelated'
  ) {
    return candidate
  }
  return getForecourtRuntimeConfig().jplRequestDispatchPolicy ?? 'auto'
}

const resolveCorrelationSupport = (
  client: JplClient | null,
): boolean | null => {
  const value = (client as any)?.getServerSupportsCorrelationIds?.()
  return value === true ? true : value === false ? false : null
}

const resolveRequestDispatchMode = (
  client: JplClient | null,
): RequestDispatchMode => {
  const direct = (client as any)?.getRequestDispatchMode?.()
  if (direct === 'correlated-concurrent' || direct === 'strict-single-flight') {
    return direct
  }

  const dispatcherMode = (client as any)?.requestDispatcher?.getDispatchMode?.()
  if (
    dispatcherMode === 'correlated-concurrent' ||
    dispatcherMode === 'strict-single-flight'
  ) {
    return dispatcherMode
  }

  return resolveCorrelationSupport(client) === true
    ? 'correlated-concurrent'
    : 'strict-single-flight'
}

const buildProtocolState = (
  client: JplClient | null,
  state: Record<string, any>,
) => {
  const cfg = getForecourtRuntimeConfig()
  const version =
    (client as any)?.getServerJplVersion?.() ??
    state.welcomeVersion ??
    state.protocolVersion ??
    undefined
  const secureMode =
    typeof state.secureMode === 'boolean'
      ? state.secureMode
      : Number(cfg.jplPort) === 8889
  const correlationSupport = resolveCorrelationSupport(client)
  const requestDispatchPolicy = resolveRequestDispatchPolicy(client)
  const requestDispatchMode = resolveRequestDispatchMode(client)
  const requestMode =
    requestDispatchMode === 'correlated-concurrent'
      ? 'correlated'
      : 'single-flight-fallback'
  const defaultSubscriptions = {
    unsolicitedFlags: [...(cfg.jplUnsolicitedFlags ?? [])],
    unsolicitedMfdrFlags: [...(cfg.jplUnsolicitedMfdrFlags ?? [])],
    drSeconds: cfg.jplUnsolicitedDrSeconds,
    statusUpdateCode: cfg.jplStatusUpdateCode,
  }
  const rawFrameDiagnosticsEnabled = Boolean(
    client &&
    typeof (client as any).listenerCount === 'function' &&
    (client as any).listenerCount('rawFrame') > 0,
  )
  const protocolHealth = buildProtocolHealth({
    protocolVersion: version,
    expectedMinVersion: cfg.jplExpectedMinVersion,
    correlationSupported: correlationSupport,
    requestMode,
    requestDispatchMode,
    requestDispatchPolicy,
    secureTransport: secureMode,
    expectedSecureTransport: Number(cfg.jplPort) === 8889,
    lastReject: state.lastReject ?? undefined,
    defaultSubscriptions,
    rawFrameDiagnosticsEnabled,
  })

  return {
    version,
    secureMode,
    tlsRequired: Boolean(cfg.jplTlsRequired),
    integrationScope: cfg.jplIntegrationScope,
    optionalProtocolFamilies: [...(cfg.jplOptionalProtocolFamilies ?? [])],
    paymentControlEnabled: false,
    correlationSupport,
    correlationCapability:
      correlationSupport === true
        ? 'supported'
        : correlationSupport === false
          ? 'unsupported'
          : 'unknown',
    requestDispatchPolicy,
    requestDispatchMode,
    requestMode,
    lastReject: state.lastReject ?? undefined,
    defaultSubscriptions,
    rawFrameDiagnosticsEnabled,
    protocolHealth,
  }
}

const deriveControllerFlags = (status: any) => ({
  serviceMessageReady: Boolean(status?.FcStatus2Flags?.bits?.ServiceMsgReady),
  backOfficeRecordExists: Boolean(
    status?.FcStatus2Flags?.bits?.BackOfficeRecordExists,
  ),
  rtcError: Boolean(status?.FcStatus2Flags?.bits?.RtcError),
  fallbackMode: Boolean(status?.FcStatus1Flags?.bits?.FallbackMode),
  storedTransactionsDisabled: Boolean(
    status?.FcStatus1Flags?.bits?.OpWithStoredTransDisabled,
  ),
  hardwareSoftwareIncompatibility: Boolean(
    status?.FcStatus2Flags?.bits?.HwSwIncompatibilityWithinFc ??
    status?.FcStatus2Flags?.bits?.HwSwIncompatibilityWithFc,
  ),
})

const deriveOnlinePeerConnections = (status: any) => {
  const connections = Array.isArray(status?.Connections)
    ? status.Connections
    : []
  return connections
    .filter((entry: any) => Boolean(entry?.ConnStatus?.bits?.online))
    .map((entry: any) => ({
      deviceType: enumLabel(entry?.PosDeviceType),
      address: entry?.ConnAddress,
      port: entry?.ServerPortNo,
    }))
}

const derivePeripheralAlerts = (status: any) => {
  const peripherals = Array.isArray(status?.Peripherals)
    ? status.Peripherals
    : []
  return peripherals
    .map((entry: any) => {
      const flags = entry?.PeripheralStatus?.bits ?? {}
      const problems = [
        !flags.is_online ? 'offline' : null,
        flags.is_in_error_state ? 'error' : null,
        flags.is_in_warning_state ? 'warning' : null,
      ].filter(Boolean) as string[]
      if (!problems.length) return null
      return {
        peripheralType: enumLabel(entry?.PeripheralType),
        address: entry?.ConnAddress,
        port: entry?.ServerPortNo,
        status: problems,
      }
    })
    .filter(Boolean)
}

const derivePumpStatusSummary = (
  entries:
    | Array<{ fpId?: string; normalized?: any; payload?: any; at: number }>
    | undefined,
) =>
  (entries ?? []).map((entry) => ({
    fpId: entry?.fpId ?? entry?.normalized?.fpId,
    mainState:
      entry?.normalized?.mainState ??
      enumLabel(entry?.payload?.FpMainState) ??
      undefined,
    nozzleState:
      entry?.normalized?.nozzleState ??
      mapJplMainState(entry?.payload?.FpMainState),
    lockId: entry?.normalized?.lockId,
    gradeId: entry?.normalized?.gradeId,
    nozzleNumber: entry?.normalized?.nozzleNumber,
    flags: entry?.normalized?.flags ?? {},
    at: entry?.at,
  }))

const derivePumpErrorDiagnostics = (
  entries:
    | Array<{ fpId?: string; normalized?: any; payload?: any; at: number }>
    | undefined,
) =>
  (entries ?? []).map((entry) => ({
    fpId: entry?.fpId ?? entry?.normalized?.fpId,
    errorCode: entry?.normalized?.errorCode,
    errorName: entry?.normalized?.errorName,
    occurredAt: entry?.normalized?.errorDateAndTime,
    pumpProtocolId: entry?.normalized?.pumpProtocolId,
    pumpErrorCode: entry?.normalized?.pumpErrorCode,
    severity: entry?.normalized?.severity,
    category: entry?.normalized?.guidance?.category,
    operatorMessage: entry?.normalized?.guidance?.operatorMessage,
    recommendedAction: entry?.normalized?.guidance?.recommendedAction,
    needsAdminIntervention: entry?.normalized?.guidance?.needsAdminIntervention,
  }))

const deriveTankStatusSummary = (
  entries:
    | Array<{ tgId?: string; normalized?: any; payload?: any; at: number }>
    | undefined,
) =>
  (entries ?? []).map((entry) => ({
    tgId: entry?.tgId ?? entry?.normalized?.tgId,
    mainState:
      entry?.normalized?.mainState ??
      enumLabel(entry?.payload?.TgMainState) ??
      undefined,
    flags: entry?.normalized?.flags ?? {},
    alarms: entry?.normalized?.alarms ?? {},
    at: entry?.at,
  }))

const deriveOptionalDeviceSummary = (
  entries: Array<{ normalized?: any; payload?: any; at: number }> | undefined,
  idKey: string,
  mainStateKey = 'mainState',
) =>
  (entries ?? []).map((entry) => ({
    id: entry?.normalized?.[idKey],
    [idKey]: entry?.normalized?.[idKey],
    mainState: entry?.normalized?.[mainStateKey],
    flags: entry?.normalized?.flags ?? {},
    at: entry?.at,
  }))

const evaluateBufferEntry = (
  mode: 'supervised' | 'unsupervised',
  entry: any,
): JplBufferEntrySummary => {
  const cfg = getForecourtRuntimeConfig()
  const ageMinutes =
    entry?.lastStatusAt != null && Number.isFinite(Number(entry.lastStatusAt))
      ? Math.max(0, (Date.now() - Number(entry.lastStatusAt)) / 60_000)
      : null

  const warnDepth =
    mode === 'supervised' ? cfg.bufferWarnDepthSup : cfg.bufferWarnDepthUnsup
  const critDepth =
    mode === 'supervised' ? cfg.bufferCritDepthSup : cfg.bufferCritDepthUnsup
  const warnAge =
    mode === 'supervised' ? cfg.bufferWarnAgeMinSup : cfg.bufferWarnAgeMinUnsup
  const critAge =
    mode === 'supervised' ? cfg.bufferCritAgeMinSup : cfg.bufferCritAgeMinUnsup

  const reasons: string[] = []
  let severity: JplBufferSeverity = 'ok'
  const depth = Number(entry?.depth ?? 0)

  if (depth >= critDepth) {
    severity = 'critical'
    reasons.push(`depth>=${critDepth}`)
  } else if (depth >= warnDepth) {
    severity = 'warn'
    reasons.push(`depth>=${warnDepth}`)
  }

  if (ageMinutes != null && ageMinutes >= critAge) {
    severity = 'critical'
    reasons.push(`age>=${critAge}m`)
  } else if (ageMinutes != null && ageMinutes >= warnAge) {
    severity = severity === 'critical' ? 'critical' : 'warn'
    reasons.push(`age>=${warnAge}m`)
  }

  if (entry?.lastError) {
    severity = 'critical'
    reasons.push('lastError')
  }

  return {
    pumpId: Number(entry?.pumpId ?? 0),
    depth,
    lastSeqNo:
      entry?.lastSeqNo != null && Number.isFinite(Number(entry.lastSeqNo))
        ? Number(entry.lastSeqNo)
        : null,
    lastStatusAt:
      entry?.lastStatusAt != null && Number.isFinite(Number(entry.lastStatusAt))
        ? Number(entry.lastStatusAt)
        : null,
    lastReadAt:
      entry?.lastReadAt != null && Number.isFinite(Number(entry.lastReadAt))
        ? Number(entry.lastReadAt)
        : null,
    lastClearAt:
      entry?.lastClearAt != null && Number.isFinite(Number(entry.lastClearAt))
        ? Number(entry.lastClearAt)
        : null,
    ageMinutes,
    severity,
    reasons,
    lastError: entry?.lastError ?? undefined,
  }
}

const deriveBufferHealth = (): {
  bufferHealth: JplBufferHealthSummary
  bufferAlerts: JplBufferAlert[]
} => {
  const raw = getJplBufferHealth()

  const summarizeBucket = (mode: 'supervised' | 'unsupervised') =>
    Object.values(
      mode === 'supervised' ? (raw.supervised ?? {}) : (raw.unsupervised ?? {}),
    )
      .map((entry) => evaluateBufferEntry(mode, entry))
      .sort((a, b) => {
        if (b.depth !== a.depth) return b.depth - a.depth
        return (b.lastStatusAt ?? 0) - (a.lastStatusAt ?? 0)
      })

  const supervised = summarizeBucket('supervised')
  const unsupervised = summarizeBucket('unsupervised')

  const bufferHealth: JplBufferHealthSummary = {
    updatedAt: raw.updatedAt,
    supervised,
    unsupervised,
    totals: {
      supervisedDepth: supervised.reduce((sum, entry) => sum + entry.depth, 0),
      unsupervisedDepth: unsupervised.reduce(
        (sum, entry) => sum + entry.depth,
        0,
      ),
      supervisedPumps: supervised.length,
      unsupervisedPumps: unsupervised.length,
    },
  }

  const bufferAlerts: JplBufferAlert[] = [
    ...supervised,
    ...unsupervised,
  ].flatMap((entry) => {
    if (entry.severity === 'ok') return []
    const mode = supervised.includes(entry) ? 'supervised' : 'unsupervised'
    return [
      {
        mode,
        pumpId: entry.pumpId,
        severity: entry.severity,
        reasons: entry.reasons,
      },
    ]
  })

  return { bufferHealth, bufferAlerts }
}

export async function ensureJplGatewayStarted() {
  const { startJplTcpAdapter } =
    await import('@/src/modules/forecourt/infrastructure/jpl/adapter')
  await startJplTcpAdapter()

  cachedStationId = cachedStationId ?? (await resolveStationId())
  const state = getJplAdapterState()
  const client = globalThis.__jplTcpClient ?? null
  const protocol = buildProtocolState(client, state as Record<string, any>)

  return {
    started: Boolean(globalThis.__jplTcpClient) || Boolean(state.connected),
    connected: Boolean(state.connected),
    loggedOn: Boolean(state.loggedOn),
    lastError: state.lastError,
    stationId: cachedStationId,
    client,
    protocol,
    protocolHealth: protocol.protocolHealth,
    sharedClient: true,
  }
}

export function getJplGatewayState() {
  const state = getJplAdapterState() as Record<string, any>
  const client = globalThis.__jplTcpClient ?? null
  const started = Boolean(globalThis.__jplTcpClient) || Boolean(state.connected)
  const { bufferHealth, bufferAlerts } = deriveBufferHealth()
  const replayCapabilities = getReplayCapabilities()
  const protocol = buildProtocolState(client, state)
  const protocolHealth: ProtocolHealthPayload = protocol.protocolHealth

  return {
    started,
    stationId: cachedStationId,
    lastError: state.lastError,
    version: protocol.version,
    secureMode: protocol.secureMode,
    correlationSupport: protocol.correlationSupport,
    requestDispatchPolicy: protocol.requestDispatchPolicy,
    requestDispatchMode: protocol.requestDispatchMode,
    requestMode: protocol.requestMode,
    lastReject: protocol.lastReject,
    protocol,
    protocolHealth,
    posId: state.posId,
    lastMessageAt: state.lastMessageAt,
    lastHeartbeatAt: state.lastHeartbeatAt,
    nextReconnectAt: state.nextReconnectAt,
    lastDisconnectReason: state.lastDisconnectReason,
    controllerStatus: state.lastFcStatus,
    posConnectionStatus: state.lastPosConnectionStatus,
    peripheralsStatus: state.lastPssPeripheralsStatus,
    installStatus: state.lastInstallStatus,
    pumpStatuses: state.lastFpStatuses,
    fpInfo: state.lastFpInfo,
    fuellingData: state.lastFpFuellingData,
    tankStatuses: state.lastTgStatuses,
    siteDeliveryStatus: state.lastSiteDeliveryStatus,
    tankDeliveryData: state.lastTankDeliveryData,
    pricePoleStatuses: state.lastPpStatuses,
    pricePoleErrors: state.lastPpErrors,
    washStatuses: state.lastWashStatuses,
    washErrors: state.lastWashErrors,
    digitalIoStatuses: state.lastDigitalIoStatuses,
    sensorStatuses: state.lastSensorStatuses,
    vendingStatuses: state.lastVendingStatuses,
    vendingErrors: state.lastVendingErrors,
    fpErrors: state.lastFpErrors,
    serviceMessages: state.lastServiceMessages,
    backOfficeRecords: state.lastBackOfficeRecords,
    bufferHealth,
    bufferAlerts,
    controllerFlags: deriveControllerFlags(state.lastFcStatus),
    onlinePeerConnections: deriveOnlinePeerConnections(
      state.lastPosConnectionStatus,
    ),
    peripheralAlerts: derivePeripheralAlerts(state.lastPssPeripheralsStatus),
    activePumpStatuses: derivePumpStatusSummary(state.lastFpStatuses),
    tankAlerts: deriveTankStatusSummary(state.lastTgStatuses),
    pricePoleSummary: deriveOptionalDeviceSummary(state.lastPpStatuses, 'ppId'),
    washSummary: deriveOptionalDeviceSummary(state.lastWashStatuses, 'wpId'),
    digitalIoSummary: deriveOptionalDeviceSummary(
      state.lastDigitalIoStatuses,
      'diopId',
    ),
    sensorSummary: deriveOptionalDeviceSummary(
      state.lastSensorStatuses,
      'sensorId',
    ),
    vendingSummary: deriveOptionalDeviceSummary(
      state.lastVendingStatuses,
      'vmId',
    ),
    pumpErrorDiagnostics: derivePumpErrorDiagnostics(state.lastFpErrors),
    replayCapabilities: { ...replayCapabilities },
    apcs: {
      apc1: {
        connected: Boolean(state.connected),
        loggedOn: Boolean(state.loggedOn),
      },
    },
  }
}

export function getJplClient(): JplClient | null {
  return globalThis.__jplTcpClient ?? null
}

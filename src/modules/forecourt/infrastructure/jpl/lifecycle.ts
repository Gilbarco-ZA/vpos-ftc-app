import '@/src/modules/forecourt/infrastructure/jpl/globals'

import * as DomsPosJpl from '@gilbarcoafs/doms-pos-jpl'
import type {
  RequestDispatchMode,
  RequestDispatchPolicy,
} from '@/src/modules/forecourt/infrastructure/runtimeConfig'
import type { JplClient } from '@gilbarcoafs/doms-pos-jpl'

import { getPostgresPoolDiagnostics } from '@/src/platform/db/postgres'
import {
  getJplAdapterState,
  getJplBufferHealth,
} from '@/src/shared/forecourt/jplState'
import { logger } from '@/src/shared/utils/logger'

import {
  normalizeTgDataPayload as normalizeSharedTgDataPayload,
  resolveConfiguredTankGaugeIds,
} from '@/src/modules/forecourt/application/tankGauge'
import {
  eventTypeFromDomainEvent,
  serializeError,
  unwrapMultiMessage,
} from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import { resetClearRejectQuarantine } from '@/src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine'
import { normalizeDomsDynamicTankDataRequest } from '@/src/modules/forecourt/infrastructure/jpl/dynamicTankData'
import {
  enqueueJplEventProcessing,
  getJplEventProcessingQueueDiagnostics,
  handleJplEvent,
} from '@/src/modules/forecourt/infrastructure/jpl/events'
import { pushForecourtLiveEvent } from '@/src/modules/forecourt/infrastructure/jpl/liveEvents'
import { writeJplTrafficLog } from '@/src/modules/forecourt/infrastructure/jpl/logging'
import {
  extractSensorAlarmErrors,
  extractVendingAlarmErrors,
  normalizeDigitalIoSnapshot,
  normalizePricePoleError,
  normalizePricePoleSnapshot,
  normalizeSensorSnapshot,
  normalizeVendingError,
  normalizeVendingSnapshot,
  normalizeVendingTotals,
} from '@/src/modules/forecourt/infrastructure/jpl/optionalModules'
import {
  getJplPersistenceQueueDiagnostics,
  persistJplEventOnce,
  syncAdapterState,
} from '@/src/modules/forecourt/infrastructure/jpl/persistence'
import {
  acquireJplPosSessionLease,
  createJplPosSessionOwnerId,
  JPL_POS_SESSION_HEARTBEAT_MS,
  releaseJplPosSessionLease,
  renewJplPosSessionLease,
} from '@/src/modules/forecourt/infrastructure/jpl/posSessionLease'
import { buildJplBootstrapConfig } from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import {
  buildJplCommandRequest,
  normalizeJplCommandAction,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import { inspectJplFrame } from '@/src/modules/forecourt/infrastructure/jpl/protocol/framing'
import {
  normalizeDigitalIoStatusPayload,
  normalizeFpErrorPayload,
  normalizeFpFuellingDataPayload,
  normalizeFpInfoPayload,
  normalizeFpStatusPayload,
  normalizePpErrorPayload,
  normalizePpStatusPayload,
  normalizeSensorStatusPayload,
  normalizeSiteDeliveryStatusPayload,
  normalizeTankDeliveryDataPayload,
  normalizeTgDataPayload,
  normalizeTgStatusPayload,
  normalizeVendingErrorPayload,
  normalizeVendingStatusPayload,
  normalizeWashErrorPayload,
  normalizeWashStatusPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'
import {
  mapRejectEnvelope,
  normalizeJplInboundEnvelope,
  prepareJplOutboundMessage,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import { getJplPumpMappings } from '@/src/modules/forecourt/infrastructure/jpl/pumpMappings'
import { reconcileTransactionBuffersOnStartup } from '@/src/modules/forecourt/infrastructure/jpl/replay'
import {
  markReplayCapability,
  resetReplayCapabilities,
} from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import { createJplSolicitedRequestGate } from '@/src/modules/forecourt/infrastructure/jpl/requestGate'
import {
  calculateJplReconnectDelay,
  evaluateJplConnectionLiveness,
  resolveJplConnectionPolicy,
} from '@/src/modules/forecourt/infrastructure/jpl/sessionPolicy'
import {
  isEmptyDomsBackOfficeRecord,
  normalizeDomsBackOfficeRecord,
  normalizeDomsServiceMessageRecord,
} from '@/src/modules/forecourt/infrastructure/jpl/specialRecords'
import { resolveStationId } from '@/src/modules/forecourt/infrastructure/jpl/station'
import {
  requestTransactionBufferStatusWithFallback,
  resetTransactionBufferSubCodePreference,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionBufferStatus'
import { buildTransactionBufferEventType } from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'
import {
  normalizeJplWashStatusBuffer,
  normalizeJplWashTransaction,
} from '@/src/modules/forecourt/infrastructure/jpl/washTransactions'
import { installJplWireDiagnostics } from '@/src/modules/forecourt/infrastructure/jpl/wireDiagnostics'
import { getForecourtMaterializationQueueDiagnostics } from '@/src/modules/forecourt/infrastructure/persistence'
import { forecourtJplDynamicTankDataRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplDynamicTankDataRepo'
import { forecourtJplOptionalModulesRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplOptionalModulesRepo'
import { forecourtJplSpecialRecordsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplSpecialRecordsRepo'
import { forecourtJplWashTransactionsRepo } from '@/src/modules/forecourt/infrastructure/repositories/forecourtJplWashTransactionsRepo'
import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

const domsJpl =
  (DomsPosJpl as any).createForecourt || (DomsPosJpl as any).JplClient
    ? (DomsPosJpl as any)
    : ((DomsPosJpl as any).default ?? (DomsPosJpl as any))

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

const boundedEnvInt = (
  name: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })

const hasForecourtPersistencePressure = () => {
  const pool = getPostgresPoolDiagnostics()
  const eventPersistence = getJplPersistenceQueueDiagnostics()
  const eventProcessing = getJplEventProcessingQueueDiagnostics()
  const materialization = getForecourtMaterializationQueueDiagnostics()
  return (
    (pool.waitingCount > 0 && pool.idleCount === 0) ||
    eventPersistence.queued >= 64 ||
    eventPersistence.oldestQueuedMs >= 15_000 ||
    (eventProcessing.active > 0 &&
      eventProcessing.active >= eventProcessing.concurrency) ||
    eventProcessing.queued >= 64 ||
    eventProcessing.oldestQueuedMs >= 15_000 ||
    materialization.queued >= 32 ||
    materialization.oldestQueuedMs >= 15_000
  )
}

const isEnabled = () => getForecourtRuntimeConfig().mode === 'jpl_tcp'

const ALL_TANK_DATA_ITEM_IDS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '41',
  '42',
  '43',
  '44',
]

const attachProcessHandlers = () => {
  if (globalThis.__jplProcessHandlersAttached) return
  globalThis.__jplProcessHandlersAttached = true

  const close = async () => {
    globalThis.__jplTcpShuttingDown = true
    clearReconnectTimer()

    const teardown = globalThis.__jplTcpTeardownPromise
    if (teardown) {
      try {
        await teardown
      } catch {
        // teardown is best effort during process shutdown
      }
    }

    const activeClient = globalThis.__jplTcpClient
    try {
      await (activeClient as any)?.disconnect?.()
    } catch {
      // ignore
    }
    clearPosSessionHeartbeat()
  }

  process.on('SIGINT', () => void close())
  process.on('SIGTERM', () => void close())
  process.on('beforeExit', () => void close())
  process.on('unhandledRejection', (reason: any) => {
    logger.error('[jplTcp]', {
      msg: 'unhandledRejection',
      error: serializeError(reason),
    })
  })
  process.on('uncaughtException', (err: any) => {
    logger.error('[jplTcp]', {
      msg: 'uncaughtException',
      error: serializeError(err),
    })
  })
}

const clearReconnectTimer = () => {
  if (!globalThis.__jplTcpReconnectTimer) return
  clearTimeout(globalThis.__jplTcpReconnectTimer)
  globalThis.__jplTcpReconnectTimer = undefined
}

const clearConnectionMonitors = () => {
  if (globalThis.__jplTcpHeartbeatTimer) {
    clearInterval(globalThis.__jplTcpHeartbeatTimer)
    globalThis.__jplTcpHeartbeatTimer = undefined
  }
  if (globalThis.__jplTcpHealthTimer) {
    clearInterval(globalThis.__jplTcpHealthTimer)
    globalThis.__jplTcpHealthTimer = undefined
  }
  if (globalThis.__jplTcpFallbackPollTimer) {
    clearInterval(globalThis.__jplTcpFallbackPollTimer)
    globalThis.__jplTcpFallbackPollTimer = undefined
  }
  globalThis.__jplTcpFallbackPollInFlight = false
  globalThis.__jplTcpFallbackBufferCursor = 0
}

const clearPosSessionHeartbeat = () => {
  if (!globalThis.__jplPosSessionHeartbeatTimer) return
  clearInterval(globalThis.__jplPosSessionHeartbeatTimer)
  globalThis.__jplPosSessionHeartbeatTimer = undefined
}

const nowMs = () => Date.now()

const markMessageSeen = (
  stationId: string,
  patch: Record<string, unknown> = {},
) => {
  const next = { lastMessageAt: nowMs(), ...patch }
  syncAdapterState(stationId, next)
}

const markRequestSent = (
  stationId: string,
  patch: Record<string, unknown> = {},
) => {
  const next = { lastRequestAt: nowMs(), ...patch }
  syncAdapterState(stationId, next)
}

const extractWelcomeVersion = (env: any) =>
  String(
    env?.data?.version ?? env?.payload?.data?.version ?? env?.version ?? '',
  ).trim()

const parseVersionTuple = (version: string) => {
  const match = String(version || '')
    .trim()
    .match(/(\d+)-(\d+)-(\d+)\.(\d+)/)
  if (!match) return null
  return match.slice(1).map((part) => Number(part))
}

const isVersionAtLeast = (candidate: string, minimum: string) => {
  const cand = parseVersionTuple(candidate)
  const min = parseVersionTuple(minimum)
  if (!cand || !min) return true
  for (let i = 0; i < Math.max(cand.length, min.length); i += 1) {
    const a = cand[i] ?? 0
    const b = min[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return true
}

const resolveRequestDispatchPolicy = (
  client: JplClient,
  cfg = getForecourtRuntimeConfig(),
): RequestDispatchPolicy => {
  const candidate = (client as any)?.opts?.requestDispatchPolicy
  if (
    candidate === 'correlation-required' ||
    candidate === 'auto' ||
    candidate === 'strict-single-flight-when-uncorrelated'
  ) {
    return candidate
  }
  return cfg.jplRequestDispatchPolicy ?? 'auto'
}

const resolveCorrelationSupport = (client: JplClient): boolean | null => {
  const value = (client as any)?.getServerSupportsCorrelationIds?.()
  return value === true ? true : value === false ? false : null
}

const resolveRequestDispatchMode = (
  client: JplClient,
  cfg = getForecourtRuntimeConfig(),
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

  const correlationSupport = resolveCorrelationSupport(client)
  const policy = resolveRequestDispatchPolicy(client, cfg)

  if (policy === 'correlation-required') {
    return correlationSupport === true
      ? 'correlated-concurrent'
      : 'strict-single-flight'
  }

  return correlationSupport === true
    ? 'correlated-concurrent'
    : 'strict-single-flight'
}

const buildProtocolCapabilityPatch = (
  client: JplClient,
  stationId: string,
  secureMode: boolean,
) => {
  const version = (client as any)?.getServerJplVersion?.() ?? undefined
  const correlationSupport = resolveCorrelationSupport(client)
  const requestDispatchPolicy = resolveRequestDispatchPolicy(client)
  const requestDispatchMode = resolveRequestDispatchMode(client)

  const correlationCapability =
    correlationSupport === true
      ? 'supported'
      : correlationSupport === false
        ? 'unsupported'
        : 'unknown'

  const requestMode =
    requestDispatchMode === 'correlated-concurrent'
      ? 'correlated'
      : 'single-flight-fallback'

  return {
    welcomeVersion: version,
    secureMode,
    protocolVersion: version,
    correlationSupport,
    correlationCapability,
    requestDispatchPolicy,
    requestDispatchMode,
    requestMode,
    lastLifecycleEventAt: nowMs(),
    stationId,
  }
}

const buildRejectError = (response: any, request?: any) => {
  const normalizedResponse = normalizeJplInboundEnvelope(response)
  const mappedReject = mapRejectEnvelope(normalizedResponse)
  const error = new Error(
    mappedReject.rejectInfo || 'JPL request rejected',
  ) as Error & {
    code?: string
    kind?: string
    rejectCode?: string
    correlationId?: string
    request?: any
    response?: any
  }
  error.code = 'JPL_REJECT'
  error.kind = mappedReject.kind
  error.rejectCode = mappedReject.rejectCode
  error.correlationId =
    normalizedResponse?.correlationId ?? request?.correlationId ?? undefined
  error.request = request
  error.response = normalizedResponse
  return error
}

const recordReject = (stationId: string, response: any, request?: any) => {
  const error = buildRejectError(response, request)
  syncAdapterState(stationId, {
    lastReject: {
      code: error.rejectCode,
      kind: (error as any).kind,
      info: error.message,
      correlationId: error.correlationId,
      at: nowMs(),
    },
    lastError: error.message,
  })
  const normalizedResponse = normalizeJplInboundEnvelope(response)
  const eventSubCode =
    String(normalizedResponse?.subCode ?? '01H').trim() || '01H'
  const eventType = `RejectMessage_resp_${eventSubCode}`
  const payload = {
    request: request ?? null,
    response: normalizedResponse ?? response ?? null,
    correlationId: error.correlationId ?? null,
    rejectCode: error.rejectCode ?? null,
    rejectKind: (error as any).kind ?? null,
    rejectInfo: error.message,
    at: nowMs(),
  }

  writeJplTrafficLog(stationId, 'error', 'RejectMessage_resp', payload)
  pushForecourtLiveEvent('jpl.reject', {
    action: eventType,
    stationId,
    correlationId: error.correlationId ?? null,
    payload,
  })
  void persistJplEventOnce({
    stationId,
    eventType,
    payload,
    occurredAt: payload.at,
  }).catch((err) => {
    logger.error('[jplTcp] reject persist error', {
      error: serializeError(err),
    })
  })

  return error
}

const redactAccessCode = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const [password] = text.split(',')
  return `${password || 'POS'},***`
}

const isInvalidFcAccessCodeError = (error: unknown) => {
  const err = error as any
  const raw = err?.raw ?? err?.response ?? undefined
  const data = raw?.data ?? {}
  const rejectCode = String(
    err?.rejectCode?.value ??
      err?.rejectCode ??
      data?.RejectCode?.value ??
      data?.RejectCode?.enum?.access_error ??
      '',
  )
    .trim()
    .toUpperCase()
  const searchable = [
    err?.message,
    err?.rejectInfoText,
    err?.rejectInfo,
    data?.RejectInfoText,
    data?.RejectInfo,
    rejectCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    rejectCode === '03H' ||
    searchable.includes('access_error') ||
    searchable.includes('fc_access_code') ||
    searchable.includes('fcaccesscode') ||
    searchable.includes('access code')
  )
}

const buildLogonEnvelopeForAccessCode = (args: {
  accessCode: string
  countryCode: string
  posVersionId: string
}) => {
  const builder = domsJpl.buildFcLogonEnvelope
  if (typeof builder === 'function') {
    return builder({
      variant: '01H',
      accessCode: args.accessCode,
      countryCode: args.countryCode,
      posVersionId: args.posVersionId,
    })
  }

  return {
    name: 'FcLogon_req',
    subCode: '01H',
    data: {
      FcAccessCode: args.accessCode,
      CountryCode: args.countryCode,
      PosVersionId: args.posVersionId,
    },
  }
}

const setClientLogonAccessCode = (args: {
  client: JplClient
  accessCode: string
  countryCode: string
  posVersionId: string
}) => {
  const existing = (args.client as any).__forecourtLogonEnvelope
  if (existing?.data) {
    existing.data.FcAccessCode = args.accessCode
    existing.data.CountryCode = args.countryCode
    existing.data.PosVersionId = args.posVersionId
    if (!existing.data.FcLogonPars) existing.data.FcLogonPars = {}
    ;(args.client as any).__forecourtLogonEnvelope = existing
    return
  }

  ;(args.client as any).__forecourtLogonEnvelope =
    buildLogonEnvelopeForAccessCode(args)
}

const orderAccessCodeCandidates = (candidates: readonly string[]) => {
  const accepted = String(globalThis.__jplTcpAcceptedAccessCode ?? '').trim()
  const normalized = candidates
    .map((candidate) => String(candidate ?? '').trim())
    .filter(Boolean)
  if (!accepted) return normalized

  const matchingIndex = normalized.findIndex(
    (candidate) => candidate.toUpperCase() === accepted.toUpperCase(),
  )
  if (matchingIndex <= 0) return normalized

  return [
    normalized[matchingIndex],
    ...normalized.slice(0, matchingIndex),
    ...normalized.slice(matchingIndex + 1),
  ]
}

const logonWithAccessCodeFallbacks = async (args: {
  client: JplClient
  stationId: string
  host: string
  port: number
  countryCode: string
  posVersionId: string
  accessCodes: readonly string[]
}) => {
  const candidates = orderAccessCodeCandidates(args.accessCodes)
  let lastError: unknown

  for (let index = 0; index < candidates.length; index += 1) {
    const accessCode = candidates[index]
    setClientLogonAccessCode({
      client: args.client,
      accessCode,
      countryCode: args.countryCode,
      posVersionId: args.posVersionId,
    })

    try {
      const response = await domsJpl.forecourtLogon(args.client)
      globalThis.__jplTcpAcceptedAccessCode = accessCode
      if (index > 0) {
        logger.warn('[jplTcp] logon succeeded with FcAccessCode fallback', {
          stationId: args.stationId,
          host: args.host,
          port: args.port,
          accessCode: redactAccessCode(accessCode),
          fallbackIndex: index,
        })
        writeJplTrafficLog(args.stationId, 'info', 'logon:fallback_ok', {
          accessCode: redactAccessCode(accessCode),
          fallbackIndex: index,
        })
      }
      return { response, accessCode, fallbackIndex: index }
    } catch (error) {
      lastError = error
      if (
        !isInvalidFcAccessCodeError(error) ||
        index === candidates.length - 1
      ) {
        throw error
      }

      globalThis.__jplTcpAcceptedAccessCode = candidates[index + 1]

      logger.warn(
        '[jplTcp] FcAccessCode rejected; retrying conservative logon',
        {
          stationId: args.stationId,
          host: args.host,
          port: args.port,
          accessCode: redactAccessCode(accessCode),
          nextAccessCode: redactAccessCode(candidates[index + 1]),
          fallbackIndex: index + 1,
          error: serializeError(error),
        },
      )
      writeJplTrafficLog(
        args.stationId,
        'error',
        'logon:access_code_rejected',
        {
          accessCode: redactAccessCode(accessCode),
          nextAccessCode: redactAccessCode(candidates[index + 1]),
          fallbackIndex: index + 1,
          error: serializeError(error),
        },
      )
    }
  }

  throw lastError ?? new Error('JPL logon failed')
}

const updateAdapterSnapshotState = (
  stationId: string,
  messageName: string,
  payload: any,
  subCode?: string,
) => {
  if (messageName === 'FcStatus_resp') {
    syncAdapterState(stationId, { lastFcStatus: payload ?? null })
    const serviceReady = Boolean(payload?.FcStatus2Flags?.bits?.ServiceMsgReady)
    const borReady = Boolean(
      payload?.FcStatus2Flags?.bits?.BackOfficeRecordExists,
    )
    if (serviceReady && globalThis.__jplTcpClient) {
      void drainFcServiceMessages(globalThis.__jplTcpClient, stationId)
    }
    if (borReady && globalThis.__jplTcpClient) {
      void drainBackOfficeRecords(globalThis.__jplTcpClient, stationId)
    }
    return
  }
  if (messageName === 'PosConnectionStatus_resp') {
    syncAdapterState(stationId, { lastPosConnectionStatus: payload ?? null })
    return
  }
  if (messageName === 'PssPeripheralsStatus_resp') {
    syncAdapterState(stationId, { lastPssPeripheralsStatus: payload ?? null })
    return
  }
  if (messageName === 'FcInstallStatus_resp') {
    syncAdapterState(stationId, { lastInstallStatus: payload ?? null })
    return
  }
  if (messageName === 'FpStatus_resp') {
    rememberFpStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'FpInfo_resp') {
    rememberFpInfo(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'FpFuellingData_resp') {
    rememberFpFuellingData(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'FpErrorMsg_resp') {
    rememberFpError(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'TgStatus_resp') {
    rememberTgStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'TgData_resp') {
    rememberTgData(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'SiteDeliveryStatus_resp') {
    rememberSiteDeliveryStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'TankDeliveryData_resp') {
    rememberTankDeliveryData(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'PpStatus_resp') {
    rememberPpStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'PpErrorMsg_resp') {
    rememberPpError(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'WpStatus_resp') {
    rememberWashStatus(stationId, payload ?? null, subCode)
    rememberWashStatusBuffer(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'WpUnSupTrans_resp') {
    rememberWashTransaction(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'WpErrorMsg_resp') {
    rememberWashError(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'DiopStatus_resp') {
    rememberDigitalIoStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'SensorStatus_resp') {
    rememberSensorStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'VmStatus_resp') {
    rememberVendingStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'VmDrystockTotals_resp') {
    rememberVendingTotals(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'VmErrorMsg_resp') {
    rememberVendingError(stationId, payload ?? null, subCode)
    return
  }
}

const rememberServiceMessage = (
  stationId: string,
  seqNo: unknown,
  message: unknown,
) => {
  const state = getJplAdapterState()
  const next = [
    {
      seqNo: seqNo != null ? String(seqNo) : undefined,
      message: message != null ? String(message) : undefined,
      at: nowMs(),
    },
    ...(state.lastServiceMessages ?? []),
  ].slice(0, 10)
  syncAdapterState(stationId, { lastServiceMessages: next })
}

const upsertSnapshotByKey = <T extends Record<string, any>>(
  list: T[] | undefined,
  key: string,
  value: T,
  limit = 32,
) => {
  const filtered = (list ?? []).filter(
    (entry) => String(entry?.[key] ?? '') !== String(value?.[key] ?? ''),
  )
  return [value, ...filtered].slice(0, limit)
}

const rememberFpStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeFpStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastFpStatuses,
    'fpId',
    {
      fpId: normalized.fpId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    48,
  )
  syncAdapterState(stationId, { lastFpStatuses: next })
}

const rememberFpInfo = (stationId: string, payload: any, subCode?: string) => {
  const state = getJplAdapterState()
  const normalized = normalizeFpInfoPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastFpInfo,
    'fpId',
    {
      fpId: normalized.fpId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    48,
  )
  syncAdapterState(stationId, { lastFpInfo: next })
}

const rememberFpFuellingData = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeFpFuellingDataPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastFpFuellingData,
    'fpId',
    {
      fpId: normalized.fpId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    48,
  )
  syncAdapterState(stationId, { lastFpFuellingData: next })
}

const rememberFpError = (stationId: string, payload: any, subCode?: string) => {
  const state = getJplAdapterState()
  const normalized = normalizeFpErrorPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastFpErrors,
    'fpId',
    {
      fpId: normalized.fpId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    48,
  )
  syncAdapterState(stationId, { lastFpErrors: next })
}

const rememberTgStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeTgStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastTgStatuses,
    'tgId',
    {
      tgId: normalized.tgId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    48,
  )
  syncAdapterState(stationId, { lastTgStatuses: next })
}

const rememberTgData = (stationId: string, payload: any, subCode?: string) => {
  const state = getJplAdapterState() as any
  const normalized = normalizeTgDataPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastTgData,
    'tgId',
    {
      tgId: normalized.tgId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    48,
  )
  syncAdapterState(stationId, { lastTgData: next } as any)
}

const rememberSiteDeliveryStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  syncAdapterState(stationId, {
    lastSiteDeliveryStatus: {
      subCode,
      normalized: normalizeSiteDeliveryStatusPayload(payload, subCode),
      payload,
      at: nowMs(),
    },
  })
}

const rememberTankDeliveryData = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeTankDeliveryDataPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastTankDeliveryData,
    'tgId',
    {
      tgId: normalized.tgId,
      deliveryReportSeqNo: normalized.deliveryReportSeqNo,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    32,
  )
  syncAdapterState(stationId, { lastTankDeliveryData: next })
}

const rememberPpStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizePpStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastPpStatuses,
    'ppId',
    { ppId: normalized.ppId, subCode, normalized, payload, at: nowMs() },
    32,
  )
  syncAdapterState(stationId, { lastPpStatuses: next })

  void forecourtJplOptionalModulesRepo
    .upsertSnapshot({
      stationId,
      snapshot: normalizePricePoleSnapshot(payload, subCode),
    })
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist price-pole snapshot',
        stationId,
        ppId: normalized.ppId,
        error: serializeError(error),
      }),
    )
}

const rememberPpError = (stationId: string, payload: any, subCode?: string) => {
  const state = getJplAdapterState()
  const normalized = normalizePpErrorPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastPpErrors,
    'ppId',
    { ppId: normalized.ppId, subCode, normalized, payload, at: nowMs() },
    32,
  )
  syncAdapterState(stationId, { lastPpErrors: next })

  void forecourtJplOptionalModulesRepo
    .upsertError({
      stationId,
      error: normalizePricePoleError(payload, subCode),
    })
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist price-pole error',
        stationId,
        ppId: normalized.ppId,
        error: serializeError(error),
      }),
    )
}

const rememberWashStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeWashStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastWashStatuses,
    'wpId',
    { wpId: normalized.wpId, subCode, normalized, payload, at: nowMs() },
    32,
  )
  syncAdapterState(stationId, { lastWashStatuses: next })
}

const rememberWashStatusBuffer = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const entries = normalizeJplWashStatusBuffer(payload, subCode)
  if (!entries.length) return

  const state = getJplAdapterState() as any
  const snapshots = entries.map((entry) => ({
    wpId: entry.wpId,
    transSeqNo: entry.transSeqNo,
    source: 'WpStatus_resp',
    normalized: entry,
    payload: entry.payloadJson,
    at: nowMs(),
  }))

  syncAdapterState(stationId, {
    lastWashTransactions: [
      ...snapshots,
      ...(state.lastWashTransactions ?? []),
    ].slice(0, 48),
  } as any)

  for (const entry of entries) {
    void forecourtJplWashTransactionsRepo
      .upsertDiscoveredBufferEntry({ stationId, entry })
      .catch((error) =>
        logger.warn('[jplTcp]', {
          msg: 'failed to persist wash buffer entry',
          stationId,
          wpId: entry.wpId,
          transSeqNo: entry.transSeqNo,
          error: error?.message ?? String(error),
        }),
      )
  }
}

const rememberWashTransaction = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const normalized = normalizeJplWashTransaction(payload, subCode)
  const state = getJplAdapterState() as any
  const key = `${normalized.wpId ?? 'unknown'}:${normalized.transSeqNo ?? normalized.sourceHash}`
  const filtered = (state.lastWashTransactions ?? []).filter(
    (entry: any) =>
      `${entry?.wpId ?? 'unknown'}:${entry?.transSeqNo ?? entry?.sourceHash}` !==
      key,
  )

  syncAdapterState(stationId, {
    lastWashTransactions: [
      {
        wpId: normalized.wpId,
        transSeqNo: normalized.transSeqNo,
        sourceHash: normalized.sourceHash,
        source: 'WpUnSupTrans_resp',
        normalized,
        payload,
        at: nowMs(),
      },
      ...filtered,
    ].slice(0, 48),
  } as any)

  void forecourtJplWashTransactionsRepo
    .upsertTransaction({ stationId, transaction: normalized })
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist wash transaction',
        stationId,
        wpId: normalized.wpId,
        transSeqNo: normalized.transSeqNo,
        error: error?.message ?? String(error),
      }),
    )
}

const rememberWashError = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeWashErrorPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastWashErrors,
    'wpId',
    { wpId: normalized.wpId, subCode, normalized, payload, at: nowMs() },
    32,
  )
  syncAdapterState(stationId, { lastWashErrors: next })
}

const rememberDigitalIoStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeDigitalIoStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastDigitalIoStatuses,
    'diopId',
    { diopId: normalized.diopId, subCode, normalized, payload, at: nowMs() },
    64,
  )
  syncAdapterState(stationId, { lastDigitalIoStatuses: next })

  void forecourtJplOptionalModulesRepo
    .upsertSnapshot({
      stationId,
      snapshot: normalizeDigitalIoSnapshot(payload, subCode),
    })
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist digital-I/O snapshot',
        stationId,
        diopId: normalized.diopId,
        error: serializeError(error),
      }),
    )
}

const rememberSensorStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeSensorStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastSensorStatuses,
    'sensorId',
    {
      sensorId: normalized.sensorId,
      subCode,
      normalized,
      payload,
      at: nowMs(),
    },
    64,
  )
  syncAdapterState(stationId, { lastSensorStatuses: next })

  void forecourtJplOptionalModulesRepo
    .upsertSnapshot({
      stationId,
      snapshot: normalizeSensorSnapshot(payload, subCode),
    })
    .then(() =>
      forecourtJplOptionalModulesRepo.upsertManyErrors({
        stationId,
        errors: extractSensorAlarmErrors(payload, subCode),
      }),
    )
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist sensor snapshot/alarms',
        stationId,
        sensorId: normalized.sensorId,
        error: serializeError(error),
      }),
    )
}

const rememberVendingStatus = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeVendingStatusPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastVendingStatuses,
    'vmId',
    { vmId: normalized.vmId, subCode, normalized, payload, at: nowMs() },
    32,
  )
  syncAdapterState(stationId, { lastVendingStatuses: next })

  void forecourtJplOptionalModulesRepo
    .upsertSnapshot({
      stationId,
      snapshot: normalizeVendingSnapshot(payload, subCode),
    })
    .then(() =>
      forecourtJplOptionalModulesRepo.upsertManyErrors({
        stationId,
        errors: extractVendingAlarmErrors(payload, subCode),
      }),
    )
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist vending snapshot/alarms',
        stationId,
        vmId: normalized.vmId,
        error: serializeError(error),
      }),
    )
}

const rememberVendingError = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState()
  const normalized = normalizeVendingErrorPayload(payload, subCode)
  const next = upsertSnapshotByKey(
    state.lastVendingErrors,
    'vmId',
    { vmId: normalized.vmId, subCode, normalized, payload, at: nowMs() },
    32,
  )
  syncAdapterState(stationId, { lastVendingErrors: next })

  void forecourtJplOptionalModulesRepo
    .upsertError({
      stationId,
      error: normalizeVendingError(payload, subCode),
    })
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist vending error',
        stationId,
        vmId: normalized.vmId,
        error: serializeError(error),
      }),
    )
}

const rememberVendingTotals = (
  stationId: string,
  payload: any,
  subCode?: string,
) => {
  const state = getJplAdapterState() as any
  const totals = normalizeVendingTotals(payload)
  if (!totals) return

  const key = `${totals.vmId}:${totals.vmTotalType ?? 'unknown'}:${totals.sourceHash}`
  const filtered = (state.lastVendingTotals ?? []).filter(
    (entry: any) =>
      `${entry?.vmId}:${entry?.vmTotalType ?? 'unknown'}:${entry?.sourceHash}` !==
      key,
  )

  syncAdapterState(stationId, {
    lastVendingTotals: [
      {
        vmId: totals.vmId,
        vmTotalType: totals.vmTotalType,
        vmTotalTypeLabel: totals.vmTotalTypeLabel,
        sourceHash: totals.sourceHash,
        subCode,
        normalized: totals,
        payload,
        at: nowMs(),
      },
      ...filtered,
    ].slice(0, 32),
  } as any)

  void forecourtJplOptionalModulesRepo
    .upsertVendingTotals({ stationId, totals })
    .catch((error) =>
      logger.warn('[jplTcp]', {
        msg: 'failed to persist vending totals',
        stationId,
        vmId: totals.vmId,
        error: serializeError(error),
      }),
    )
}

const rememberBackOfficeRecord = (
  stationId: string,
  record: {
    seqNo?: string
    formatId?: string
    subCode?: string
    payload?: any
  },
) => {
  const state = getJplAdapterState()
  const next = [
    {
      seqNo: record.seqNo,
      formatId: record.formatId,
      subCode: record.subCode,
      payload: record.payload ?? null,
      at: nowMs(),
    },
    ...(state.lastBackOfficeRecords ?? []),
  ].slice(0, 10)
  syncAdapterState(stationId, { lastBackOfficeRecords: next })
}

const requestBackOfficeRecord = async (
  client: JplClient,
  stationId: string,
) => {
  const preferred = String(process.env.JPL_BACK_OFFICE_RECORD_SUBCODE || '02H')
    .trim()
    .toUpperCase()
  const variants = [preferred, '02H', '01H', '00H'].filter(
    (value, index, list) => list.indexOf(value) === index,
  )

  let lastError: any = null
  for (const subCode of variants) {
    try {
      const response = await (client as any).request({
        name: 'BackOfficeRecord_req',
        subCode,
        data: {},
      })
      return { response, usedSubCode: subCode }
    } catch (error: any) {
      lastError = error
      const detail = String(error?.message ?? '').toLowerCase()
      if (
        !(detail.includes('unknown') && detail.includes(subCode.toLowerCase()))
      ) {
        logger.warn('[jplTcp] back office record read failed', {
          stationId,
          subCode,
          error: serializeError(error),
        })
        throw error
      }
    }
  }

  throw lastError ?? new Error('No supported BackOfficeRecord subCode found')
}

const drainFcServiceMessages = async (client: JplClient, stationId: string) => {
  if (globalThis.__jplServiceDrainInFlight) {
    return await globalThis.__jplServiceDrainInFlight
  }

  globalThis.__jplServiceDrainInFlight = (async () => {
    for (let i = 0; i < 10; i += 1) {
      let response: any
      try {
        response = await (client as any).request({
          name: 'FcServiceMsg_req',
          subCode: '00H',
          data: {},
        })
      } catch (error) {
        logger.warn('[jplTcp] service log drain read failed', {
          stationId,
          error: serializeError(error),
        })
        break
      }

      const env = normalizeJplInboundEnvelope(response)
      const payload = env?.data ?? {}
      const seqNo = payload?.FcServiceMsgSeqNo
      const message = payload?.FcServiceMsg
      if (seqNo == null || message == null || String(message).trim() === '') {
        break
      }

      const record = normalizeDomsServiceMessageRecord({
        stationId,
        seqNo,
        message,
        payload,
      })
      rememberServiceMessage(stationId, seqNo, message)
      writeJplTrafficLog(stationId, 'recv', 'FcServiceMsg_resp_00H', payload)

      try {
        await forecourtJplSpecialRecordsRepo.upsertServiceMessage(record)
      } catch (error) {
        logger.warn('[jplTcp] service log persistence failed', {
          stationId,
          seqNo,
          error: serializeError(error),
        })
      }

      try {
        await forecourtJplSpecialRecordsRepo.markServiceMessageClearAttempt(
          record,
        )
      } catch (error) {
        logger.warn('[jplTcp] service log clear-attempt persistence failed', {
          stationId,
          seqNo,
          error: serializeError(error),
        })
      }

      try {
        await (client as any).request({
          name: 'clear_FcServiceMsg_req',
          subCode: '00H',
          data: { FcServiceMsgSeqNo: String(seqNo) },
        })
        try {
          await forecourtJplSpecialRecordsRepo.markServiceMessageCleared(record)
        } catch (error) {
          logger.warn('[jplTcp] service log cleared persistence failed', {
            stationId,
            seqNo,
            error: serializeError(error),
          })
        }
      } catch (error) {
        try {
          await forecourtJplSpecialRecordsRepo.markServiceMessageFailed(
            record,
            error,
          )
        } catch {
          // best-effort only
        }
        logger.warn('[jplTcp] service log drain clear failed', {
          stationId,
          seqNo,
          error: serializeError(error),
        })
        break
      }
    }
  })()

  try {
    await globalThis.__jplServiceDrainInFlight
  } finally {
    globalThis.__jplServiceDrainInFlight = undefined
  }
}

const drainBackOfficeRecords = async (client: JplClient, stationId: string) => {
  if (globalThis.__jplBorDrainInFlight) {
    return await globalThis.__jplBorDrainInFlight
  }

  globalThis.__jplBorDrainInFlight = (async () => {
    for (let i = 0; i < 10; i += 1) {
      let result: any
      try {
        result = await requestBackOfficeRecord(client, stationId)
      } catch (error) {
        logger.warn('[jplTcp] back office record drain read failed', {
          stationId,
          error: serializeError(error),
        })
        break
      }

      const responseEnvelope = normalizeJplInboundEnvelope(result?.response)
      const payload = responseEnvelope?.data ?? {}
      const record = normalizeDomsBackOfficeRecord({
        stationId,
        subCode: String(result?.usedSubCode ?? '00H'),
        payload,
      })
      if (isEmptyDomsBackOfficeRecord(record)) {
        break
      }

      rememberBackOfficeRecord(stationId, {
        seqNo: record.seqNo,
        formatId: record.formatId,
        subCode: record.subCode,
        payload: record.payloadJson,
      })
      writeJplTrafficLog(
        stationId,
        'recv',
        `BackOfficeRecord_resp_${record.subCode}`,
        payload,
      )

      try {
        await forecourtJplSpecialRecordsRepo.upsertBackOfficeRecord(record)
      } catch (error) {
        logger.warn('[jplTcp] back office record persistence failed', {
          stationId,
          seqNo: record.seqNo,
          error: serializeError(error),
        })
      }

      try {
        await forecourtJplSpecialRecordsRepo.markBackOfficeRecordClearAttempt(
          record,
        )
      } catch (error) {
        logger.warn('[jplTcp] back office clear-attempt persistence failed', {
          stationId,
          seqNo: record.seqNo,
          error: serializeError(error),
        })
      }

      try {
        await (client as any).request({
          name: 'clear_BackOfficeRecord_req',
          subCode: '00H',
          data: { BorSeqNo: String(record.seqNo) },
        })
        try {
          await forecourtJplSpecialRecordsRepo.markBackOfficeRecordCleared(
            record,
          )
        } catch (error) {
          logger.warn('[jplTcp] back office cleared persistence failed', {
            stationId,
            seqNo: record.seqNo,
            error: serializeError(error),
          })
        }
      } catch (error) {
        try {
          await forecourtJplSpecialRecordsRepo.markBackOfficeRecordFailed(
            record,
            error,
          )
        } catch {
          // best-effort only
        }
        logger.warn('[jplTcp] back office record drain clear failed', {
          stationId,
          seqNo: record.seqNo,
          error: serializeError(error),
        })
        break
      }
    }
  })()

  try {
    await globalThis.__jplBorDrainInFlight
  } finally {
    globalThis.__jplBorDrainInFlight = undefined
  }
}

const runStartupSnapshot = async (client: JplClient, stationId: string) => {
  const requests = [
    { name: 'FcStatus_req', subCode: '00H', data: {} },
    { name: 'PosConnectionStatus_req', subCode: '00H', data: {} },
    { name: 'PssPeripheralsStatus_req', subCode: '00H', data: {} },
    { name: 'FcInstallStatus_req', subCode: '00H', data: {} },
  ]

  for (const request of requests) {
    try {
      const response = normalizeJplInboundEnvelope(
        await (client as any).request(request),
      )
      updateAdapterSnapshotState(
        stationId,
        String(response?.name ?? ''),
        response?.data ?? {},
        String(response?.subCode ?? '').trim() || undefined,
      )
    } catch (error) {
      logger.warn('[jplTcp] bootstrap snapshot request failed', {
        stationId,
        request: request.name,
        error: serializeError(error),
      })
    }
  }
}

const resolvePollFpIds = async (stationId: string) => {
  const mappings = await getJplPumpMappings(stationId)
  const ids = Array.from(mappings.keys())
    .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map((value) => String(Math.trunc(Number(value))).padStart(2, '0'))
  return ids.length ? ids : ['00']
}

const pollJplLiveState = async (args: {
  client: JplClient
  stationId: string
}) => {
  const { client, stationId } = args
  if (globalThis.__jplTcpClient !== client) return
  if (globalThis.__jplTcpFallbackPollInFlight) return
  globalThis.__jplTcpFallbackPollInFlight = true

  try {
    if (hasForecourtPersistencePressure()) {
      logger.debug('[jplTcp] fallback poll deferred by persistence pressure', {
        stationId,
        pool: getPostgresPoolDiagnostics(),
        eventPersistence: getJplPersistenceQueueDiagnostics(),
        eventProcessing: getJplEventProcessingQueueDiagnostics(),
        materialization: getForecourtMaterializationQueueDiagnostics(),
      })
      return
    }

    const fpIds = await resolvePollFpIds(stationId)
    const staleAfterMs = boundedEnvInt(
      'VPOS_JPL_BUFFER_STALE_MS',
      180_000,
      60_000,
      15 * 60_000,
    )
    const bufferBatchSize = boundedEnvInt(
      'VPOS_JPL_FALLBACK_BUFFER_BATCH',
      8,
      1,
      32,
    )
    const requestGapMs = boundedEnvInt(
      'VPOS_JPL_FALLBACK_REQUEST_GAP_MS',
      75,
      0,
      1_000,
    )

    // DOMS supports FpId=00 as the controller-wide poll-all request. Keep the
    // master's single request rather than multiplying this into one request per
    // configured pump.
    try {
      // The vendor client emits every matched response through `message` before
      // resolving request(). Protocol listeners own persistence/dispatch, so
      // the polling path must not route the returned response a second time.
      await (client as any).request({
        name: 'FpStatus_req',
        subCode: '00H',
        data: { FpId: '00' },
      })
    } catch (error) {
      logger.debug('[jplTcp] fallback FpStatus poll failed', {
        stationId,
        error: serializeError(error),
      })
    }

    const bufferHealth = getJplBufferHealth()
    const candidates: Array<{
      fpId: string
      sourceMode: 'supervised' | 'unsupervised'
    }> = []
    for (const fpId of fpIds) {
      for (const sourceMode of ['supervised', 'unsupervised'] as const) {
        candidates.push({ fpId, sourceMode })
      }
    }
    if (!candidates.length) return

    const cursor =
      Number(globalThis.__jplTcpFallbackBufferCursor ?? 0) % candidates.length
    const ordered = [
      ...candidates.slice(cursor),
      ...candidates.slice(0, cursor),
    ]
    const now = nowMs()
    let attempted = 0
    let inspected = 0

    for (const candidate of ordered) {
      inspected += 1
      if (attempted >= bufferBatchSize) break
      if (globalThis.__jplTcpClient !== client) return
      if (hasForecourtPersistencePressure()) break

      const bucket =
        bufferHealth[candidate.sourceMode]?.[String(Number(candidate.fpId))]
      const lastStatusAt = Number(bucket?.lastStatusAt ?? 0)
      if (lastStatusAt > 0 && now - lastStatusAt < staleAfterMs) continue

      attempted += 1
      try {
        const bufferStatus = await requestTransactionBufferStatusWithFallback({
          client,
          sourceMode: candidate.sourceMode,
          fpId: candidate.fpId,
        })
        markReplayCapability(candidate.sourceMode, 'allowed')
        const bufferPayload = bufferStatus.response?.data ?? {}
        await persistJplEventOnce({
          stationId,
          eventType: bufferStatus.responseEventType,
          payload: bufferPayload,
          occurredAt: (bufferPayload as any)?.at ?? nowMs(),
        }).catch((error) => {
          logger.error('[jplTcp] fallback buffer persist failed', {
            stationId,
            fpId: candidate.fpId,
            sourceMode: candidate.sourceMode,
            error: serializeError(error),
          })
        })
        await enqueueJplEventProcessing(
          bufferStatus.responseEventType,
          bufferPayload,
        )
      } catch (error) {
        logger.debug('[jplTcp] fallback transaction-buffer poll failed', {
          stationId,
          fpId: candidate.fpId,
          sourceMode: candidate.sourceMode,
          error: serializeError(error),
        })
      }

      if (requestGapMs > 0) await delay(requestGapMs)
    }

    globalThis.__jplTcpFallbackBufferCursor =
      (cursor + Math.max(1, inspected)) % candidates.length
  } finally {
    globalThis.__jplTcpFallbackPollInFlight = false
  }
}

const startJplFallbackPolling = (args: {
  client: JplClient
  stationId: string
}) => {
  if (globalThis.__jplTcpFallbackPollTimer) {
    clearInterval(globalThis.__jplTcpFallbackPollTimer)
    globalThis.__jplTcpFallbackPollTimer = undefined
  }

  const intervalMs = boundedEnvInt(
    'VPOS_JPL_FALLBACK_POLL_MS',
    60_000,
    60_000,
    5 * 60_000,
  )

  // Startup reconciliation already establishes the transaction-buffer
  // baseline. Routine fallback work is deliberately low-frequency and bounded
  // per sweep so it cannot recreate the 64-request burst on every heartbeat.
  globalThis.__jplTcpFallbackPollTimer = setInterval(() => {
    void pollJplLiveState(args).catch((error) =>
      logger.debug('[jplTcp] fallback poll failed', {
        stationId: args.stationId,
        error: serializeError(error),
      }),
    )
  }, intervalMs)
  globalThis.__jplTcpFallbackPollTimer.unref?.()

  syncAdapterState(args.stationId, {
    liveFallbackPollIntervalMs: intervalMs,
    lastLifecycleEventAt: nowMs(),
  } as any)
}

const dispatchMultiMessage = async (
  stationId: string,
  eventType: string,
  payload: any,
) => {
  const entries = unwrapMultiMessage(eventType, payload)
  if (!entries?.length) return false

  for (const entry of entries) {
    const nestedEventType = String(entry?.__eventType ?? '')
      .trim()
      .replace(/_$/, '')
    const nestedPayload = entry?.payload ?? entry?.data ?? {}
    if (!nestedEventType) continue

    const nestedMessageName = nestedEventType
      .replace(/_[0-9A-F]{2}H$/i, '')
      .replace(/_$/, '')
    const nestedSubCodeMatch = nestedEventType.match(/_([0-9A-F]{2}H)$/i)
    updateAdapterSnapshotState(
      stationId,
      nestedMessageName,
      nestedPayload,
      nestedSubCodeMatch?.[1]?.toUpperCase(),
    )

    writeJplTrafficLog(stationId, 'recv', nestedEventType, nestedPayload)
    void persistJplEventOnce({
      stationId,
      eventType: nestedEventType,
      payload: nestedPayload,
      occurredAt: nestedPayload?.at ?? nowMs(),
    }).catch((err) =>
      logger.error('[jplTcp]', {
        msg: 'persist error',
        error: serializeError(err),
      }),
    )

    await handleJplEvent(nestedEventType, nestedPayload)
  }

  return true
}

const disposeProtocolListeners = () => {
  clearConnectionMonitors()
  if (globalThis.__jplTcpProtocolDisposers?.length) {
    for (const dispose of globalThis.__jplTcpProtocolDisposers) {
      try {
        dispose()
      } catch {
        // ignore
      }
    }
  }

  globalThis.__jplTcpProtocolDisposers = []
}

const detachClient = async (client?: JplClient) => {
  const activeClient = client ?? globalThis.__jplTcpClient
  disposeProtocolListeners()

  // Hide the stale client before closing its physical DOMS socket so command
  // paths cannot reuse it. A replacement is serialized behind teardown.
  if (!client || globalThis.__jplTcpClient === client) {
    globalThis.__jplTcpClient = undefined
  }
  globalThis.__jplTcpAdapterStarted = false

  try {
    await (activeClient as any)?.disconnect?.()
  } catch (error) {
    logger.warn('[jplTcp]', {
      msg: 'failed to close JPL client during teardown',
      error: serializeError(error),
    })
  }

  try {
    ;(activeClient as any)?.removeAllListeners?.()
  } catch {
    // ignore
  }
}

const scheduleReconnect = (stationId: string, reason: string) => {
  if (!isEnabled() || globalThis.__jplTcpShuttingDown) return
  if (globalThis.__jplTcpReconnectTimer) return

  const state = getJplAdapterState()
  const attempts = Math.max(1, Number(state.reconnectAttempts || 0))
  const delay = calculateJplReconnectDelay({
    attempt: attempts,
    baseDelayMs: RECONNECT_BASE_MS,
    maxDelayMs: RECONNECT_MAX_MS,
  })

  const nextReconnectAt = nowMs() + delay

  syncAdapterState(stationId, {
    reconnectAttempts: attempts,
    nextReconnectAt,
    lastDisconnectReason: reason,
  })

  logger.warn('[jplTcp] scheduling reconnect', {
    stationId,
    delayMs: delay,
    reconnectAttempts: attempts,
    reason,
    nextReconnectAt,
  })

  pushForecourtLiveEvent('jpl.lifecycle', {
    action: 'reconnect:scheduled',
    stationId,
    delayMs: delay,
    reconnectAttempts: attempts,
    reason,
    nextReconnectAt,
  })

  globalThis.__jplTcpReconnectTimer = setTimeout(() => {
    globalThis.__jplTcpReconnectTimer = undefined
    void startJplTcpAdapter().catch((err) => {
      logger.error('[jplTcp] scheduled reconnect failed', {
        stationId,
        error: serializeError(err),
      })
    })
  }, delay)
  globalThis.__jplTcpReconnectTimer.unref?.()
}

const markDisconnected = async (args: {
  stationId: string
  client?: JplClient
  reason: string
  error?: unknown
  shouldReconnect?: boolean
  releaseLease?: () => Promise<void>
}) => {
  const {
    stationId,
    client,
    reason,
    error,
    shouldReconnect = true,
    releaseLease,
  } = args
  const serializedError = error ? serializeError(error) : undefined

  const state = getJplAdapterState()
  const nextAttempts = (state.reconnectAttempts || 0) + 1
  const lastError =
    error instanceof Error
      ? error.message
      : typeof error === 'string' && error
        ? error
        : reason

  syncAdapterState(stationId, {
    connected: false,
    loggedOn: false,
    lastError,
    reconnectAttempts: nextAttempts,
    lastDisconnectReason: reason,
    lastLifecycleEventAt: nowMs(),
  })

  pushForecourtLiveEvent('jpl.lifecycle', {
    action: 'offline',
    stationId,
    reason,
    error: serializedError ?? null,
    reconnectAttempts: nextAttempts,
  })

  writeJplTrafficLog(stationId, 'error', 'connection:lost', {
    reason,
    error: serializedError,
    reconnectAttempts: nextAttempts,
  })

  logger.error('[jplTcp] connection lost', {
    stationId,
    reason,
    error: serializedError,
    reconnectAttempts: nextAttempts,
  })

  // Keep lease ownership until the old physical socket is actually closed.
  await detachClient(client)

  if (releaseLease) {
    try {
      await releaseLease()
    } catch (releaseError) {
      logger.warn('[jplTcp]', {
        msg: 'failed to release JPL PosId session lease',
        stationId,
        error: serializeError(releaseError),
      })
    }
  }
  clearPosSessionHeartbeat()

  if (shouldReconnect && !globalThis.__jplTcpShuttingDown) {
    scheduleReconnect(stationId, reason)
  }
}

const attachJplProtocolListeners = (args: {
  client: JplClient
  stationId: string
}) => {
  const { client, stationId } = args

  globalThis.__jplTcpProtocolDisposers =
    globalThis.__jplTcpProtocolDisposers || []

  const recordFrameDiagnostic = (rawFrame: unknown) => {
    const diagnostic = inspectJplFrame(rawFrame)
    const state = getJplAdapterState()
    const frameDiagnostics = [
      diagnostic,
      ...((state.frameDiagnostics ?? []) as any[]),
    ].slice(0, 20)

    syncAdapterState(stationId, {
      lastFrameDiagnostic: diagnostic,
      frameDiagnostics,
      lastLifecycleEventAt: nowMs(),
      ...(diagnostic.valid
        ? {}
        : { lastError: `${diagnostic.code}: ${diagnostic.message}` }),
    })

    if (diagnostic.valid) return

    const payload = { diagnostic }
    writeJplTrafficLog(stationId, 'error', `frame:${diagnostic.code}`, payload)
    pushForecourtLiveEvent('jpl.frame', {
      action: `frame:${diagnostic.code}`,
      stationId,
      payload,
    })
    logger.warn('[jplTcp] malformed JPL frame', { stationId, diagnostic })
  }

  const onRawFrame = (rawFrame: unknown) => recordFrameDiagnostic(rawFrame)
  if (typeof (client as any).on === 'function') {
    ;(client as any).on('rawFrame', onRawFrame)
    globalThis.__jplTcpProtocolDisposers.push(() => {
      try {
        if (typeof (client as any).off === 'function') {
          ;(client as any).off('rawFrame', onRawFrame)
        }
      } catch {
        // ignore
      }
    })
  }

  const onFramingError = (error: any) => {
    const rawFrame = error?.frame ?? error?.raw ?? error?.data ?? error
    recordFrameDiagnostic(rawFrame)
  }
  if (typeof (client as any).on === 'function') {
    ;(client as any).on('framingError', onFramingError)
    globalThis.__jplTcpProtocolDisposers.push(() => {
      try {
        if (typeof (client as any).off === 'function') {
          ;(client as any).off('framingError', onFramingError)
        }
      } catch {
        // ignore
      }
    })
  }

  const persistAndHandle = (eventType: string, data: any) => {
    const messageName = String(eventType)
      .replace(/_[0-9A-F]{2}H$/i, '')
      .replace(/_$/, '')
    const eventSubCodeMatch = String(eventType).match(/_([0-9A-F]{2}H)$/i)
    updateAdapterSnapshotState(
      stationId,
      messageName,
      data,
      eventSubCodeMatch?.[1]?.toUpperCase(),
    )
    writeJplTrafficLog(stationId, 'recv', eventType, data)
    pushForecourtLiveEvent('jpl.recv', {
      action: eventType,
      stationId,
      payload: data ?? null,
    })

    markMessageSeen(stationId, {
      lastHeartbeatAt: String(eventType).toLowerCase().includes('heartbeat')
        ? nowMs()
        : undefined,
    })

    void persistJplEventOnce({
      stationId,
      eventType,
      payload: data,
      occurredAt: (data as any)?.at ?? nowMs(),
    }).catch((err) =>
      logger.error('[jplTcp]', {
        msg: 'persist error',
        error: serializeError(err),
      }),
    )

    void enqueueJplEventProcessing(eventType, data).catch(() => {
      // Queue owns structured failure logging.
    })
  }

  const onUnsolicited = (env: any) => {
    if (!env || typeof env !== 'object') return

    let inbound: ReturnType<typeof normalizeJplInboundEnvelope>
    try {
      inbound = normalizeJplInboundEnvelope(env)
    } catch (error) {
      const serializedError = serializeError(error)
      const payload = {
        error: serializedError,
        envelope: env,
        at: nowMs(),
      }
      syncAdapterState(stationId, {
        lastError:
          serializedError.message || 'Invalid inbound JPL envelope received',
        lastLifecycleEventAt: payload.at,
      })
      writeJplTrafficLog(stationId, 'error', 'envelope:invalid', payload)
      pushForecourtLiveEvent('jpl.frame', {
        action: 'envelope:invalid',
        stationId,
        payload,
      })
      logger.warn('[jplTcp] invalid inbound JPL envelope', {
        stationId,
        error: serializedError,
        envelope: env,
      })
      return
    }

    const name = String(inbound.name ?? '').trim()
    if (
      name !== 'FpStatus_resp' &&
      name !== 'FpSupTransBufStatus_resp' &&
      name !== 'FpUnSupTransBufStatus_resp' &&
      name !== 'TgStatus_resp' &&
      name !== 'SiteDeliveryStatus_resp' &&
      name !== 'FcStatus_resp' &&
      name !== 'PosConnectionStatus_resp' &&
      name !== 'PssPeripheralsStatus_resp' &&
      name !== 'FcInstallStatus_resp' &&
      name !== 'PpStatus_resp' &&
      name !== 'PpErrorMsg_resp' &&
      name !== 'WpStatus_resp' &&
      name !== 'WpUnSupTrans_resp' &&
      name !== 'WpErrorMsg_resp' &&
      name !== 'DiopStatus_resp' &&
      name !== 'SensorStatus_resp' &&
      name !== 'VmStatus_resp' &&
      name !== 'VmErrorMsg_resp' &&
      name !== 'MultiMessage_resp' &&
      name !== 'heartbeat'
    ) {
      return
    }

    const sub = String(inbound.subCode ?? '').trim()
    const eventType =
      name === 'FpSupTransBufStatus_resp' ||
      name === 'FpUnSupTransBufStatus_resp'
        ? buildTransactionBufferEventType(name, inbound.subCode)
        : sub
          ? `${name}_${sub}`
          : name
    persistAndHandle(eventType, inbound.data ?? {})
  }

  client.on('unsolicited', onUnsolicited)
  globalThis.__jplTcpProtocolDisposers.push(() => {
    try {
      client.off('unsolicited', onUnsolicited)
    } catch {
      // ignore
    }
  })

  logger.info(
    '[jplTcp] protocol listeners attached (direct unsolicited forecourt events)',
  )
}

export const requestJplTcpTankGaugeData = async () => {
  if (!globalThis.__jplTcpClient) {
    await startJplTcpAdapter()
  }

  const client = globalThis.__jplTcpClient
  if (!client) throw new Error('JPL TCP adapter is not connected')

  const stationId = await resolveStationId()
  const tgIds = await resolveConfiguredTankGaugeIds(stationId || '')

  if (!tgIds.length) {
    throw new Error(
      'No configured DOMS tank ids found. Set domsTankId (or numeric tank code) for each tank in tank settings.',
    )
  }

  const items: Array<any> = []
  const errors: Array<{ tgId: string; error: string }> = []

  for (const tgId of tgIds) {
    try {
      const response = await client.request(
        prepareJplOutboundMessage({
          name: 'TgData_req',
          subCode: '00H',
          data: { TgId: tgId, TankDataItemId: ALL_TANK_DATA_ITEM_IDS },
        }) as any,
      )
      const payload = response?.data ?? response?.payload?.data ?? response
      rememberTgData(stationId || '', payload, '00H')
      const parsed = normalizeSharedTgDataPayload(response)
      if (parsed) items.push(parsed)
    } catch (error: any) {
      errors.push({
        tgId,
        error: error?.message || 'Failed to request tank gauge data',
      })
    }
  }

  if (!items.length) {
    throw new Error(errors[0]?.error || 'Failed to request tank gauge data')
  }

  return items
}

const startConnectionMonitors = (args: {
  client: JplClient
  stationId: string
  onConnectionLost: (reason: string, error?: unknown) => void
}) => {
  const { client, stationId, onConnectionLost } = args
  clearConnectionMonitors()

  const cfg = getForecourtRuntimeConfig()
  const policy = resolveJplConnectionPolicy({
    heartbeatIntervalMs: cfg.jplHeartbeatIntervalMs,
    deadConnectionTimeoutMs: cfg.jplDeadConnectionTimeoutMs,
  })

  syncAdapterState(stationId, {
    heartbeatIntervalMs: policy.heartbeatIntervalMs,
    deadConnectionTimeoutMs: policy.deadConnectionTimeoutMs,
  })

  globalThis.__jplTcpHealthTimer = setInterval(() => {
    if (globalThis.__jplTcpClient !== client) return
    const state = getJplAdapterState()
    const liveness = evaluateJplConnectionLiveness({
      now: nowMs(),
      lastMessageAt: state.lastMessageAt,
      lastConnectAt: state.lastConnectAt,
      deadConnectionTimeoutMs: policy.deadConnectionTimeoutMs,
    })
    if (liveness.status === 'dead') {
      onConnectionLost(
        'dead_connection_timeout',
        new Error(`No JPL message received for ${liveness.ageMs}ms`),
      )
    }
  }, policy.monitorIntervalMs)
  globalThis.__jplTcpHealthTimer.unref?.()
}

const startJplTcpAdapterInternal = async () => {
  if (!isEnabled()) return
  if (globalThis.__jplTcpAdapterStarted && globalThis.__jplTcpClient) return

  const stationId = await resolveStationId()
  if (!stationId) {
    logger.warn('[jplTcp] no station configured; adapter not started')
    return
  }

  const cfg = getForecourtRuntimeConfig()
  const bootstrap = buildJplBootstrapConfig(cfg)
  const posSessionOwnerId =
    globalThis.__jplPosSessionOwnerId ?? createJplPosSessionOwnerId()
  globalThis.__jplPosSessionOwnerId = posSessionOwnerId
  const posSessionLease = await acquireJplPosSessionLease({
    stationId,
    posId: bootstrap.posId,
    ownerId: posSessionOwnerId,
  })
  if (!posSessionLease) {
    throw new Error(
      `JPL PosId ${bootstrap.posId} is already leased by another active physical client for station ${stationId}`,
    )
  }

  globalThis.__jplPosSessionHeartbeatTimer = setInterval(() => {
    void renewJplPosSessionLease({
      stationId,
      posId: bootstrap.posId,
      ownerId: posSessionOwnerId,
    })
      .then((renewed) => {
        if (!renewed) {
          logger.error('[jplTcp]', {
            msg: 'lost JPL PosId session lease',
            stationId,
            posId: bootstrap.posId,
          })
        }
      })
      .catch((error) => {
        logger.error('[jplTcp]', {
          msg: 'failed to renew JPL PosId session lease',
          stationId,
          posId: bootstrap.posId,
          error: serializeError(error),
        })
      })
  }, JPL_POS_SESSION_HEARTBEAT_MS)
  const accessCode = bootstrap.accessCode
  const accessCodeCandidates = bootstrap.accessCodeFallbacks ?? [accessCode]
  let activeAccessCode = accessCode
  const countryCode = bootstrap.countryCode
  const posVersionId = bootstrap.posVersionId

  const disposeWireDiagnostics = installJplWireDiagnostics({
    stationId,
    port: cfg.jplPort,
  })
  globalThis.__jplTcpProtocolDisposers =
    globalThis.__jplTcpProtocolDisposers || []
  globalThis.__jplTcpProtocolDisposers.push(disposeWireDiagnostics)

  const { client, bus } = domsJpl.createForecourt({
    client: {
      ...(bootstrap.clientOptions as any),
      requestDispatchPolicy: cfg.jplRequestDispatchPolicy,
    } as any,
    logon: bootstrap.logonOptions,
    features: bootstrap.features,
  })

  writeJplTrafficLog(stationId, 'info', 'wire:diagnostics_enabled', {
    host: cfg.jplHost,
    port: cfg.jplPort,
    secureMode: bootstrap.secureMode,
    configuredPosVersion: bootstrap.posVersionId,
    domsPosJplDependency: '^1.1.16',
    vendorReportedVersion:
      (domsJpl as any).version ??
      (domsJpl as any).VERSION ??
      (domsJpl as any).packageVersion ??
      null,
    captureScope: [
      'FpSupTrans',
      'FpSupTransBufStatus',
      'clear_FpSupTrans',
      'unlock_FpSupTrans',
      'RejectMessage',
      'FcServiceMsg',
    ],
  })

  let disconnected = false
  const onConnectionLost = (reason: string, error?: unknown) => {
    if (disconnected) return
    disconnected = true

    const teardown = markDisconnected({
      stationId,
      client,
      reason,
      error,
      releaseLease: async () => {
        await releaseJplPosSessionLease({
          stationId,
          posId: bootstrap.posId,
          ownerId: posSessionOwnerId,
        })
      },
    })
    globalThis.__jplTcpTeardownPromise = teardown
    void teardown.finally(() => {
      if (globalThis.__jplTcpTeardownPromise === teardown) {
        globalThis.__jplTcpTeardownPromise = undefined
      }
    })
  }

  const originalRequest = client.request.bind(client)
  const requestGate = createJplSolicitedRequestGate({
    client: client as any,
    maxConcurrent: boundedEnvInt('VPOS_JPL_REQUEST_CONCURRENCY', 8, 1, 32),
    onModeChange: (diagnostics) => {
      logger.info('[jplTcp]', {
        msg: 'solicited request gate mode changed',
        stationId,
        ...diagnostics,
      })
      syncAdapterState(stationId, {
        requestDispatchMode: diagnostics.mode,
        requestMode:
          diagnostics.mode === 'correlated-concurrent'
            ? 'correlated'
            : 'single-flight-fallback',
      } as any)
    },
  })

  ;(client as any).request = async (message: any, ...rest: any[]) =>
    await requestGate.run(async () => {
      const requestEnvelope = prepareJplOutboundMessage(message ?? {})
      const reqName = String(requestEnvelope?.name ?? 'unknown')
      const reqSubCode = String(requestEnvelope?.subCode ?? '').trim()
      const reqEvent = reqSubCode ? `${reqName}_${reqSubCode}` : reqName

      try {
        // doms-pos-jpl negotiates correlation support and may attach the ID while
        // creating the pending request. The process-wide gate re-evaluates the
        // negotiated dispatch mode before every request, so once a controller
        // falls back to uncorrelated replies no second solicited request can
        // overlap the active one.
        const pendingResponse = originalRequest(requestEnvelope as any, ...rest)
        const wireCorrelationId = requestEnvelope.correlationId ?? undefined

        markRequestSent(stationId, {
          lastCorrelationId: wireCorrelationId,
          lastHeartbeatSentAt: reqName === 'heartbeat' ? nowMs() : undefined,
        })

        writeJplTrafficLog(stationId, 'send', reqEvent, {
          correlationId: wireCorrelationId,
          payload: requestEnvelope?.data ?? requestEnvelope,
        })
        pushForecourtLiveEvent('jpl.send', {
          action: reqEvent,
          stationId,
          correlationId: wireCorrelationId,
          payload: requestEnvelope?.data ?? requestEnvelope ?? null,
        })

        const response = normalizeJplInboundEnvelope(await pendingResponse)
        const respName = String(response?.name ?? `${reqName}_resp`)
        const respSubCode = String(response?.subCode ?? '').trim()
        const respEvent = respSubCode ? `${respName}_${respSubCode}` : respName
        const correlationId =
          response?.correlationId ?? requestEnvelope.correlationId ?? undefined

        markMessageSeen(stationId, {
          lastHeartbeatAt: respName === 'heartbeat' ? nowMs() : undefined,
          lastCorrelationId: correlationId,
        })

        writeJplTrafficLog(stationId, 'recv', respEvent, {
          correlationId,
          payload: response?.data ?? response,
        })
        pushForecourtLiveEvent('jpl.response', {
          action: respEvent,
          stationId,
          correlationId,
          payload: response?.data ?? response ?? null,
        })

        if (respName === 'RejectMessage_resp') {
          throw recordReject(stationId, response, requestEnvelope)
        }

        return response
      } catch (err) {
        writeJplTrafficLog(
          stationId,
          'error',
          `${reqEvent}:request_failed`,
          serializeError(err),
        )
        pushForecourtLiveEvent('jpl.error', {
          action: `${reqEvent}:request_failed`,
          stationId,
          correlationId: requestEnvelope.correlationId,
          error: serializeError(err),
        })
        throw err
      }
    })

  const onSend = (message: any) => {
    const requestEnvelope = prepareJplOutboundMessage(message ?? {})
    const reqName = String(requestEnvelope?.name ?? 'unknown')
    const reqSubCode = String(requestEnvelope?.subCode ?? '').trim()
    const reqEvent = reqSubCode ? `${reqName}_${reqSubCode}` : reqName

    markRequestSent(stationId, {
      lastCorrelationId: requestEnvelope.correlationId,
      lastHeartbeatSentAt: reqName === 'heartbeat' ? nowMs() : undefined,
    })

    writeJplTrafficLog(stationId, 'send', reqEvent, {
      correlationId: requestEnvelope.correlationId,
      payload: requestEnvelope?.data ?? requestEnvelope,
    })
    pushForecourtLiveEvent('jpl.send', {
      action: reqEvent,
      stationId,
      correlationId: requestEnvelope.correlationId,
      payload: requestEnvelope?.data ?? requestEnvelope ?? null,
    })
  }

  try {
    const onError = (e: any) => {
      logger.error('[jplTcp] client error', { error: serializeError(e) })
      onConnectionLost('error', e)
    }
    const onClose = (...args: any[]) => {
      logger.error('[jplTcp] client close', { args })
      onConnectionLost('close', args?.[0])
    }
    const onDisconnect = (...args: any[]) => {
      logger.error('[jplTcp] client disconnect', { args })
      onConnectionLost('disconnect', args?.[0])
    }

    client.on('error', onError)
    client.on('send', onSend)
    ;(client as any).on?.('close', onClose)
    ;(client as any).on?.('disconnect', onDisconnect)

    globalThis.__jplTcpProtocolDisposers =
      globalThis.__jplTcpProtocolDisposers || []
    globalThis.__jplTcpProtocolDisposers.push(() => {
      try {
        client.off('error', onError)
      } catch {
        // ignore
      }
      try {
        client.off('send', onSend)
      } catch {
        // ignore
      }
      try {
        ;(client as any).off?.('close', onClose)
      } catch {
        // ignore
      }
      try {
        ;(client as any).off?.('disconnect', onDisconnect)
      } catch {
        // ignore
      }
    })
  } catch {
    // ignore
  }

  const busUnsubscribe = bus.onEvent((evt: any) => {
    const eventType = eventTypeFromDomainEvent(evt)
    const payload = evt?.payload ?? {}

    markMessageSeen(stationId, {
      lastHeartbeatAt: String(eventType).toLowerCase().includes('heartbeat')
        ? nowMs()
        : undefined,
    })

    writeJplTrafficLog(stationId, 'info', `domain:${eventType}`, payload)
    pushForecourtLiveEvent('jpl.domain', {
      action: eventType,
      stationId,
      payload: payload ?? null,
    })

    void persistJplEventOnce({
      stationId,
      eventType,
      payload,
      occurredAt: (payload as any)?.at ?? nowMs(),
    }).catch((err) =>
      logger.error('[jplTcp] persist error', { error: serializeError(err) }),
    )

    void enqueueJplEventProcessing(eventType, payload).catch(() => {
      // Queue owns structured failure logging.
    })
  })

  if (typeof busUnsubscribe === 'function') {
    globalThis.__jplTcpProtocolDisposers =
      globalThis.__jplTcpProtocolDisposers || []
    globalThis.__jplTcpProtocolDisposers.push(() => {
      try {
        ;(busUnsubscribe as any)()
      } catch {
        // ignore
      }
    })
  }

  const onMessage = (msg: any) => {
    const inbound = normalizeJplInboundEnvelope(msg)
    const name = String(inbound?.name ?? '').trim()
    const subCode = String(inbound?.subCode ?? '').trim()
    if (!name) return

    if (
      inbound?.solicited === false &&
      name !== 'jpl' &&
      name !== 'heartbeat'
    ) {
      return
    }

    const payload = inbound?.data ?? {}
    markMessageSeen(stationId, {
      lastHeartbeatAt: name === 'heartbeat' ? nowMs() : undefined,
      lastCorrelationId: inbound?.correlationId ?? undefined,
    })

    // The vendor client emits MultiMessage inner envelopes through `message`
    // before emitting the wrapper. Processing both would persist and handle
    // every inner pump state twice, so the wrapper is observability-only here.
    if (name === 'MultiMessage_resp') return

    updateAdapterSnapshotState(stationId, name, payload, subCode || undefined)

    if (name === 'jpl') {
      const version = extractWelcomeVersion(inbound)
      if (version) {
        const cfg = getForecourtRuntimeConfig()
        const supported = isVersionAtLeast(version, cfg.jplExpectedMinVersion)
        syncAdapterState(stationId, {
          welcomeVersion: version,
          secureMode: Number(cfg.jplPort) === 8889,
          lastError: supported
            ? undefined
            : `Unsupported JPL version ${version}; expected >= ${cfg.jplExpectedMinVersion}`,
          ...(buildProtocolCapabilityPatch(
            globalThis.__jplTcpClient ?? client,
            stationId,
            Number(cfg.jplPort) === 8889,
          ) as any),
        } as any)
        if (!supported) {
          logger.warn('[jplTcp] unsupported JPL version banner', {
            stationId,
            version,
            expectedMinVersion: cfg.jplExpectedMinVersion,
          })
        }
      }
      return
    }

    if (name === 'heartbeat') return

    if (name === 'RejectMessage_resp') {
      recordReject(stationId, inbound)
      return
    }

    const eventType =
      name === 'FpSupTransBufStatus_resp' ||
      name === 'FpUnSupTransBufStatus_resp'
        ? buildTransactionBufferEventType(name, subCode)
        : subCode
          ? `${name}_${subCode}`
          : name

    writeJplTrafficLog(stationId, 'recv', eventType, {
      correlationId: inbound?.correlationId ?? null,
      payload,
    })
    pushForecourtLiveEvent('jpl.response', {
      action: eventType,
      stationId,
      correlationId: inbound?.correlationId ?? null,
      payload: payload ?? null,
    })

    const isReplayManagedBufferMessage =
      name === 'FpSupTransBufStatus_resp' ||
      name === 'FpUnSupTransBufStatus_resp'
    const isReplayManagedReadMessage =
      name === 'FpSupTrans_resp' || name === 'FpUnSupTrans_resp'

    if (isReplayManagedBufferMessage || isReplayManagedReadMessage) {
      return
    }

    void persistJplEventOnce({
      stationId,
      eventType,
      payload,
      occurredAt: (payload as any)?.at ?? nowMs(),
    }).catch((err) => {
      logger.error('[jplTcp] persist raw message error', {
        eventType,
        error: serializeError(err),
      })
    })
    void enqueueJplEventProcessing(eventType, payload).catch(() => {
      // Queue owns structured failure logging.
    })
  }

  client.on('message', onMessage)
  globalThis.__jplTcpProtocolDisposers =
    globalThis.__jplTcpProtocolDisposers || []
  globalThis.__jplTcpProtocolDisposers.push(() => {
    try {
      client.off('message', onMessage)
    } catch {
      // ignore
    }
  })

  try {
    pushForecourtLiveEvent('jpl.info', { action: 'connect:start', stationId })
    writeJplTrafficLog(stationId, 'info', 'connect:start', {
      host: cfg.jplHost,
      port: cfg.jplPort,
    })
    await client.connect()
    pushForecourtLiveEvent('jpl.info', { action: 'logon:start', stationId })
    writeJplTrafficLog(stationId, 'info', 'logon:start', {
      accessCode,
      countryCode,
      posVersionId,
      posId: bootstrap.posId,
    })
    const logonResult = await logonWithAccessCodeFallbacks({
      client,
      stationId,
      host: cfg.jplHost,
      port: cfg.jplPort,
      countryCode,
      posVersionId,
      accessCodes: accessCodeCandidates,
    })
    activeAccessCode = logonResult.accessCode
    const requestedStatusUpdateCode = Number(cfg.jplStatusUpdateCode ?? 3)
    const effectiveStatusUpdateCode = Number(bootstrap.statusUpdateCode ?? 3)
    if (
      Number.isFinite(requestedStatusUpdateCode) &&
      requestedStatusUpdateCode !== effectiveStatusUpdateCode
    ) {
      logger.warn(
        '[jplTcp] overriding disabled status update mode to keep unsolicited updates enabled',
        {
          stationId,
          requestedStatusUpdateCode,
          effectiveStatusUpdateCode,
        },
      )
    }
    try {
      await (client as any).request({
        name: 'change_FcStatusUpdateMode_req',
        subCode: '00H',
        data: { StatusUpdateCode: effectiveStatusUpdateCode },
      })
    } catch (error) {
      logger.warn(
        '[jplTcp] unable to set status update mode during bootstrap',
        {
          stationId,
          statusUpdateCode: bootstrap.statusUpdateCode,
          error: serializeError(error),
        },
      )
    }
    if (bootstrap.bootstrapSnapshotEnabled) {
      await runStartupSnapshot(client, stationId)
    }
    pushForecourtLiveEvent('jpl.info', { action: 'logon:ok', stationId })
    writeJplTrafficLog(stationId, 'info', 'logon:ok', {
      accessCode: activeAccessCode,
      countryCode,
      posVersionId,
      posId: bootstrap.posId,
      statusUpdateCode: bootstrap.statusUpdateCode,
      bootstrapSnapshotEnabled: bootstrap.bootstrapSnapshotEnabled,
      integrationScope: bootstrap.integrationScope,
      tlsRequired: bootstrap.tlsRequired,
      optionalProtocolFamilies: bootstrap.optionalProtocolFamilies,
      features: bootstrap.features,
    })
  } catch (err: any) {
    const redactedAccessCode = redactAccessCode(activeAccessCode || accessCode)
    logger.error('[JPL-ADAPTER] connect/logon failed', {
      host: cfg.jplHost,
      port: cfg.jplPort,
      stationId,
      countryCode,
      posVersionId,
      accessCode: redactedAccessCode,
      error: serializeError(err),
    })

    onConnectionLost('connect/logon_failed', err)
    return
  }

  clearReconnectTimer()

  const st = getJplAdapterState()
  st.connected = true
  st.lastConnectAt = Date.now()
  st.lastError = undefined
  st.reconnectAttempts = 0

  syncAdapterState(stationId, {
    connected: st.connected,
    loggedOn: true,
    secureMode: bootstrap.secureMode,
    posId: bootstrap.posId,
    lastConnectAt: st.lastConnectAt,
    lastError: st.lastError,
    reconnectAttempts: st.reconnectAttempts,
    nextReconnectAt: undefined,
    lastDisconnectReason: undefined,
    lastLifecycleEventAt: nowMs(),
    heartbeatIntervalMs: cfg.jplHeartbeatIntervalMs,
    deadConnectionTimeoutMs: cfg.jplDeadConnectionTimeoutMs,
    welcomeVersion: st.welcomeVersion,
    ...(buildProtocolCapabilityPatch(
      client,
      stationId,
      bootstrap.secureMode,
    ) as any),
  } as any)

  pushForecourtLiveEvent('jpl.lifecycle', {
    action: 'online',
    stationId,
    secureMode: bootstrap.secureMode,
    posId: bootstrap.posId,
    version: st.welcomeVersion ?? null,
    correlationSupport: resolveCorrelationSupport(client),
    requestDispatchPolicy: resolveRequestDispatchPolicy(client, cfg),
    requestDispatchMode: resolveRequestDispatchMode(client, cfg),
  })

  globalThis.__jplTcpClient = client
  globalThis.__jplTcpAdapterStarted = true
  globalThis.__jplTcpFallbackBufferCursor = 0
  resetReplayCapabilities()
  resetTransactionBufferSubCodePreference()
  resetClearRejectQuarantine(stationId)

  startConnectionMonitors({ client, stationId, onConnectionLost })
  attachJplProtocolListeners({ client, stationId })
  attachProcessHandlers()
  globalThis.__jplPumpMappingsCache = undefined

  logger.info('[jplTcp] adapter connected', {
    host: cfg.jplHost,
    port: cfg.jplPort,
  })

  try {
    await reconcileTransactionBuffersOnStartup({
      client,
      stationId,
      handleBufferStatusEvent: async (eventType, payload) => {
        await persistJplEventOnce({
          stationId,
          eventType,
          payload,
          occurredAt: (payload as any)?.at ?? nowMs(),
        }).catch((error) => {
          logger.error('[jplTcp] startup buffer persist failed', {
            stationId,
            eventType,
            error: serializeError(error),
          })
        })
        await handleJplEvent(eventType, payload)
      },
    })
  } catch (err) {
    logger.error('[jplTcp] startup reconciliation failed', {
      error: serializeError(err),
    })
  } finally {
    if (globalThis.__jplTcpClient === client) {
      startJplFallbackPolling({ client, stationId })
    }
  }
}

export const startJplTcpAdapter = async () => {
  if (!isEnabled() || globalThis.__jplTcpShuttingDown) return

  const teardown = globalThis.__jplTcpTeardownPromise
  if (teardown) await teardown
  if (globalThis.__jplTcpAdapterStarted && globalThis.__jplTcpClient) return
  if (globalThis.__jplTcpStartPromise) {
    await globalThis.__jplTcpStartPromise
    return
  }

  const startPromise = startJplTcpAdapterInternal()
  globalThis.__jplTcpStartPromise = startPromise
  try {
    await startPromise
  } finally {
    if (globalThis.__jplTcpStartPromise === startPromise) {
      globalThis.__jplTcpStartPromise = undefined
    }
  }
}

export const sendJplTcpCommand = async (action: string, payload: any) => {
  pushForecourtLiveEvent('command', {
    action: String(action ?? '').trim(),
    stationId:
      typeof payload?.stationId === 'string' ? payload.stationId : null,
    pumpId: payload?.pumpNumber ?? payload?.FpId ?? null,
    nozzleId: payload?.nozzleNumber ?? payload?.NozzleNumber ?? null,
    payload: payload ?? null,
  })
  if (!globalThis.__jplTcpClient) {
    await startJplTcpAdapter()
  }

  const client = globalThis.__jplTcpClient
  if (!client) throw new Error('JPL TCP adapter is not connected')

  const normalized = normalizeJplCommandAction(action)
  if (!normalized || normalized === 'PING' || normalized === 'STATUS') return

  const request = buildJplCommandRequest(normalized, payload)
  if (!request) {
    throw new Error(`Unsupported JPL TCP command: ${action}`)
  }

  const responseStationId = String(
    payload?.stationId ?? (await resolveStationId()) ?? '',
  )
  const dynamicTankAudit =
    normalized === 'CHANGE_DYNAMIC_TANK_DATA'
      ? normalizeDomsDynamicTankDataRequest(payload ?? {})
      : null

  if (dynamicTankAudit) {
    await forecourtJplDynamicTankDataRepo.recordRequested({
      stationId: responseStationId,
      request: dynamicTankAudit,
      commandEnvelope: request,
    })
  }

  let response: any
  try {
    response = await client.request(request as any)
    if (dynamicTankAudit) {
      await forecourtJplDynamicTankDataRepo.markSent({
        stationId: responseStationId,
        sourceHash: dynamicTankAudit.sourceHash,
        response,
      })
    }
  } catch (error) {
    if (dynamicTankAudit) {
      await forecourtJplDynamicTankDataRepo.markFailed({
        stationId: responseStationId,
        sourceHash: dynamicTankAudit.sourceHash,
        error,
      })
    }
    throw error
  }
  try {
    const inbound = normalizeJplInboundEnvelope(response)
    const name = String(inbound?.name ?? '').trim()
    if (name && name !== 'heartbeat' && name !== 'jpl') {
      const subCode = String(inbound?.subCode ?? '').trim()
      updateAdapterSnapshotState(
        responseStationId,
        name,
        inbound?.data ?? {},
        subCode || undefined,
      )
      if (
        await dispatchMultiMessage(
          responseStationId,
          subCode ? `${name}_${subCode}` : name,
          inbound?.data ?? {},
        )
      ) {
        return inbound
      }
    }
  } catch (error) {
    logger.debug('[jplTcp] command response snapshot update skipped', {
      action,
      error: serializeError(error),
    })
  }

  return response
}

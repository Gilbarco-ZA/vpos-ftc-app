import '@/src/modules/forecourt/infrastructure/jpl/globals'

import {
  createForecourt,
  forecourtLogon,
  JplClient,
  TransactionBufferWatcher,
} from '@gilbarcoafs/doms-pos-jpl'

import {
  normalizeTgDataPayload,
  resolveConfiguredTankGaugeIds,
} from '@/src/shared/doms/tankGauge'
import {
  eventTypeFromDomainEvent,
  serializeError,
  unwrapMultiMessage,
} from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import { getJplAdapterState } from '@/src/shared/forecourt/jplState'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtimeConfig'
import { logger } from '@/src/shared/utils/logger'

import { handleJplEvent } from '@/src/modules/forecourt/infrastructure/jpl/events'
import { pushForecourtLiveEvent } from '@/src/modules/forecourt/infrastructure/jpl/liveEvents'
import { writeJplTrafficLog } from '@/src/modules/forecourt/infrastructure/jpl/logging'
import {
  persistJplEventOnce,
  syncAdapterState,
} from '@/src/modules/forecourt/infrastructure/jpl/persistence'
import { buildJplBootstrapConfig } from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import {
  buildJplCommandRequest,
  normalizeJplCommandAction,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import {
  normalizeFpErrorPayload,
  normalizeFpFuellingDataPayload,
  normalizeFpInfoPayload,
  normalizeFpStatusPayload,
  normalizeSiteDeliveryStatusPayload,
  normalizeTankDeliveryDataPayload,
  normalizeTgStatusPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'
import {
  createCorrelationId,
  mapRejectEnvelope,
  normalizeJplInboundEnvelope,
  validateJplOutboundMessage,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import { reconcileTransactionBuffersOnStartup } from '@/src/modules/forecourt/infrastructure/jpl/replay'
import { resolveStationId } from '@/src/modules/forecourt/infrastructure/jpl/station'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

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

let processHandlersAttached = false
const attachProcessHandlers = (client: JplClient) => {
  if (processHandlersAttached) return
  processHandlersAttached = true

  const close = async () => {
    try {
      await (client as any).disconnect?.()
    } catch {
      // ignore
    }
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
  writeJplTrafficLog(stationId, 'error', 'RejectMessage_resp', {
    request: request ?? null,
    response: response ?? null,
    correlationId: error.correlationId ?? null,
    rejectCode: error.rejectCode ?? null,
    rejectKind: (error as any).kind ?? null,
    message: error.message,
  })
  return error
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
  if (messageName === 'SiteDeliveryStatus_resp') {
    rememberSiteDeliveryStatus(stationId, payload ?? null, subCode)
    return
  }
  if (messageName === 'TankDeliveryData_resp') {
    rememberTankDeliveryData(stationId, payload ?? null, subCode)
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

const normalizeBackOfficeRecordResponse = (
  response: any,
  usedSubCode: string,
) => {
  const env = normalizeJplInboundEnvelope(response)
  const payload = env?.data ?? {}
  return {
    seqNo: payload?.BorSeqNo != null ? String(payload.BorSeqNo) : undefined,
    formatId:
      String(
        payload?.BorFormatId?.value ?? payload?.BorFormatId ?? '',
      ).trim() || undefined,
    subCode: usedSubCode,
    payload,
  }
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

      rememberServiceMessage(stationId, seqNo, message)
      writeJplTrafficLog(stationId, 'recv', 'FcServiceMsg_resp_00H', payload)

      try {
        await (client as any).request({
          name: 'clear_FcServiceMsg_req',
          subCode: '00H',
          data: { FcServiceMsgSeqNo: String(seqNo) },
        })
      } catch (error) {
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

      const record = normalizeBackOfficeRecordResponse(
        result?.response,
        String(result?.usedSubCode ?? '00H'),
      )
      if (!record.seqNo) {
        break
      }

      const payload = record.payload ?? {}
      const isEmptySubc00 =
        record.subCode === '00H' && Number(payload?.BorLen ?? 0) <= 0
      const isEmptySubc01 =
        record.subCode === '01H' && Number(payload?.BorLength ?? 0) <= 0
      const isEmptySubc02 =
        record.subCode === '02H' && !String(payload?.BorData ?? '').trim()
      if (isEmptySubc00 || isEmptySubc01 || isEmptySubc02) {
        break
      }

      rememberBackOfficeRecord(stationId, record)
      writeJplTrafficLog(
        stationId,
        'recv',
        `BackOfficeRecord_resp_${record.subCode}`,
        payload,
      )

      try {
        await (client as any).request({
          name: 'clear_BackOfficeRecord_req',
          subCode: '00H',
          data: { BorSeqNo: String(record.seqNo) },
        })
      } catch (error) {
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
      logger.error('[jplTcp]', { msg: 'persist error', error: err }),
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
  globalThis.__jplTcpTxBufferWatcher = undefined
}

const detachClient = (client?: JplClient) => {
  const activeClient = client ?? globalThis.__jplTcpClient
  disposeProtocolListeners()

  try {
    ;(activeClient as any)?.removeAllListeners?.()
  } catch {
    // ignore
  }

  if (!client || globalThis.__jplTcpClient === client) {
    globalThis.__jplTcpClient = undefined
  }
  globalThis.__jplTcpAdapterStarted = false
}

const scheduleReconnect = (stationId: string, reason: string) => {
  if (!isEnabled()) return
  if (globalThis.__jplTcpReconnectTimer) return

  const state = getJplAdapterState()
  const attempts = Math.max(1, Number(state.reconnectAttempts || 0))
  const delay = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** (attempts - 1),
  )

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

const markDisconnected = (args: {
  stationId: string
  client?: JplClient
  reason: string
  error?: unknown
  shouldReconnect?: boolean
}) => {
  const { stationId, client, reason, error, shouldReconnect = true } = args
  const serializedError = error ? serializeError(error) : undefined

  detachClient(client)

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

  if (shouldReconnect) {
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
      logger.error('[jplTcp]', { msg: 'persist error', error: err }),
    )

    void (async () => {
      if (await dispatchMultiMessage(stationId, eventType, data)) return
      await handleJplEvent(eventType, data)
    })().catch((err) => {
      logger.error('[jplTcp]', {
        msg: 'handleJplEvent error',
        eventType,
        error: err,
      })
    })
  }

  const onUnsolicited = (env: any) => {
    if (!env || typeof env !== 'object') return

    const inbound = normalizeJplInboundEnvelope(env)
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
      name !== 'MultiMessage_resp' &&
      name !== 'heartbeat'
    ) {
      return
    }

    const subRaw = String(inbound.subCode ?? '').trim()
    const sub =
      (name === 'FpSupTransBufStatus_resp' ||
        name === 'FpUnSupTransBufStatus_resp') &&
      subRaw === '00H'
        ? '03H'
        : subRaw
    const eventType = sub ? `${name}_${sub}` : name
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

  const txWatcher = new TransactionBufferWatcher(client, { strict: false })
  globalThis.__jplTcpTxBufferWatcher = txWatcher
  txWatcher.start()

  const onSup = (e: any) => {
    const subRaw = String(e?.raw?.subCode ?? '').trim()
    const sub = subRaw === '00H' ? '03H' : subRaw
    const eventType = sub
      ? `FpSupTransBufStatus_resp_${sub}`
      : 'FpSupTransBufStatus_resp'
    persistAndHandle(eventType, e?.raw?.data ?? {})
  }

  const onUnSup = (e: any) => {
    const subRaw = String(e?.raw?.subCode ?? '').trim()
    const sub = subRaw === '00H' ? '03H' : subRaw
    const eventType = sub
      ? `FpUnSupTransBufStatus_resp_${sub}`
      : 'FpUnSupTransBufStatus_resp'
    persistAndHandle(eventType, e?.raw?.data ?? {})
  }

  txWatcher.on('supBufferUpdated', onSup)
  txWatcher.on('unsupBufferUpdated', onUnSup)

  globalThis.__jplTcpProtocolDisposers.push(() => {
    try {
      txWatcher.off('supBufferUpdated', onSup)
      txWatcher.off('unsupBufferUpdated', onUnSup)
      txWatcher.stop()
    } catch {
      // ignore
    }
  })

  logger.info(
    '[jplTcp] protocol listeners attached (FpStatus + TransactionBufferWatcher)',
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
      const response = await client.request({
        name: 'TgData_req',
        subCode: '00H',
        data: { TgId: tgId, TankDataItemId: ALL_TANK_DATA_ITEM_IDS },
      } as any)
      const parsed = normalizeTgDataPayload(response)
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
  const heartbeatMs = Math.max(
    5_000,
    Number(cfg.jplHeartbeatIntervalMs || 15_000),
  )
  const deadTimeoutMs = Math.max(
    heartbeatMs + 5_000,
    Number(cfg.jplDeadConnectionTimeoutMs || 30_000),
  )

  syncAdapterState(stationId, {
    heartbeatIntervalMs: heartbeatMs,
    deadConnectionTimeoutMs: deadTimeoutMs,
  })

  globalThis.__jplTcpHeartbeatTimer = setInterval(() => {
    if (globalThis.__jplTcpClient !== client) return
    const state = getJplAdapterState()
    const lastOutbound = Math.max(
      Number(state.lastRequestAt ?? 0),
      Number(state.lastHeartbeatSentAt ?? 0),
    )
    if (lastOutbound && nowMs() - lastOutbound < heartbeatMs - 250) return

    void (client as any)
      .request({ name: 'heartbeat', subCode: '00H', data: {} })
      .catch((error: unknown) => {
        logger.warn('[jplTcp] heartbeat failed', {
          stationId,
          error: serializeError(error),
        })
        onConnectionLost('heartbeat_failed', error)
      })
  }, heartbeatMs)
  globalThis.__jplTcpHeartbeatTimer.unref?.()

  globalThis.__jplTcpHealthTimer = setInterval(
    () => {
      if (globalThis.__jplTcpClient !== client) return
      const state = getJplAdapterState()
      const lastSeen = Number(state.lastMessageAt ?? state.lastConnectAt ?? 0)
      if (!lastSeen) return
      const ageMs = nowMs() - lastSeen
      if (ageMs > deadTimeoutMs) {
        onConnectionLost(
          'dead_connection_timeout',
          new Error(`No JPL message received for ${ageMs}ms`),
        )
      }
    },
    Math.max(1_000, Math.min(5_000, Math.trunc(heartbeatMs / 2))),
  )
  globalThis.__jplTcpHealthTimer.unref?.()
}

export const startJplTcpAdapter = async () => {
  if (!isEnabled()) return
  if (globalThis.__jplTcpAdapterStarted && globalThis.__jplTcpClient) return

  const stationId = await resolveStationId()
  if (!stationId) {
    logger.warn('[jplTcp] no station configured; adapter not started')
    return
  }

  const cfg = getForecourtRuntimeConfig()
  const bootstrap = buildJplBootstrapConfig(cfg)
  const accessCode = bootstrap.accessCode
  const countryCode = bootstrap.countryCode
  const posVersionId = bootstrap.posVersionId

  const { client, bus } = createForecourt({
    client: bootstrap.clientOptions as any,
    logon: bootstrap.logonOptions,
    features: bootstrap.features,
  })

  let disconnected = false
  const onConnectionLost = (reason: string, error?: unknown) => {
    if (disconnected) return
    disconnected = true
    markDisconnected({ stationId, client, reason, error })
  }

  const originalRequest = client.request.bind(client)
  ;(client as any).request = async (message: any, ...rest: any[]) => {
    const requestEnvelope = validateJplOutboundMessage({
      ...(message ?? {}),
      correlationId: message?.correlationId ?? createCorrelationId(),
    })
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
    try {
      const response = normalizeJplInboundEnvelope(
        await originalRequest(requestEnvelope, ...rest),
      )
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
    }).catch((err) => logger.error('[jplTcp] persist error', { error: err }))

    void (async () => {
      if (await dispatchMultiMessage(stationId, eventType, payload)) return
      await handleJplEvent(eventType, payload)
    })().catch((err) => {
      logger.error('[jplTcp] handle event error', { eventType, error: err })
    })
  })

  if (typeof busUnsubscribe === 'function') {
    globalThis.__jplTcpProtocolDisposers =
      globalThis.__jplTcpProtocolDisposers || []
    globalThis.__jplTcpProtocolDisposers.push(() => {
      try {
        busUnsubscribe()
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

    const payload = inbound?.data ?? {}
    markMessageSeen(stationId, {
      lastHeartbeatAt: name === 'heartbeat' ? nowMs() : undefined,
      lastCorrelationId: inbound?.correlationId ?? undefined,
    })
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
        })
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

    if (inbound?.solicited === false) return

    let eventType = subCode ? `${name}_${subCode}` : name
    if (
      (name === 'FpSupTransBufStatus_resp' ||
        name === 'FpUnSupTransBufStatus_resp') &&
      subCode === '00H'
    ) {
      eventType = `${name}_03H`
    }

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

    void (async () => {
      if (await dispatchMultiMessage(stationId, eventType, payload)) return

      await persistJplEventOnce({
        stationId,
        eventType,
        payload,
        occurredAt: (payload as any)?.at ?? nowMs(),
      })
      await handleJplEvent(eventType, payload)
    })().catch((err) => {
      logger.error('[jplTcp] handle raw message error', {
        eventType,
        error: err,
      })
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
    await forecourtLogon(client)
    try {
      await (client as any).request({
        name: 'change_FcStatusUpdateMode_req',
        subCode: '00H',
        data: { StatusUpdateCode: Number(bootstrap.statusUpdateCode ?? 3) },
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
      accessCode,
      countryCode,
      posVersionId,
      posId: bootstrap.posId,
      statusUpdateCode: bootstrap.statusUpdateCode,
      bootstrapSnapshotEnabled: bootstrap.bootstrapSnapshotEnabled,
    })
  } catch (err: any) {
    const redactedAccessCode = accessCode
      ? `${String(accessCode).slice(0, 4)}***`
      : null
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
    throw err
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
  })

  pushForecourtLiveEvent('jpl.lifecycle', {
    action: 'online',
    stationId,
    secureMode: bootstrap.secureMode,
    posId: bootstrap.posId,
    version: st.welcomeVersion ?? null,
  })

  globalThis.__jplTcpClient = client
  globalThis.__jplTcpAdapterStarted = true

  startConnectionMonitors({ client, stationId, onConnectionLost })
  attachJplProtocolListeners({ client, stationId })
  attachProcessHandlers(client)
  globalThis.__jplPumpMappingsCache = undefined

  logger.info('[jplTcp] adapter connected', {
    host: cfg.jplHost,
    port: cfg.jplPort,
  })

  try {
    await reconcileTransactionBuffersOnStartup({
      client,
      stationId,
      handleBufferStatusEvent: handleJplEvent,
    })
  } catch (err) {
    logger.error('[jplTcp] startup reconciliation failed', {
      error: serializeError(err),
    })
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

  await client.request(request as any)
}

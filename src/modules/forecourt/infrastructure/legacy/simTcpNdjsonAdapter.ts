import net from 'node:net'

import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { isUuid, uuidv4 } from '@/src/shared/utils/uuid'

import {
  getLegacyForecourtMode,
  loadLegacyForecourtNetworkConfigFromDb,
} from '@/src/modules/forecourt/infrastructure/legacy/runtimeConfig'
import { triggerForecourtCommandProcessing } from '@/src/modules/forecourt/infrastructure/queue/processor'
import { fuelStationsRepo } from '@/src/modules/forecourt/infrastructure/repositories/fuelStationsRepo'
import { pumpMappingsRepo } from '@/src/modules/forecourt/infrastructure/repositories/pumpMappingsRepo'

const RECONNECT_BASE_MS = 2000
const RECONNECT_MAX_MS = 30_000
const IDLE_TIMEOUT_MS = 30_000
const PUMP_MAP_TTL_MS = 60_000

const isEnabled = () => getLegacyForecourtMode() === 'sim_tcp'

type SimPumpState = 'IDLE' | 'CALL' | 'DISPENSING' | 'PAUSED' | 'TRANS_READY'

type SimPumpRaw = {
  id: number
  online: boolean
  authorized: boolean
  state: SimPumpState
  gradeSelected: number | null
  volume: number
  amount: number
  errorCode: number
}

type SimPump = {
  id: number
  online: boolean
  authorized: boolean
  state: SimPumpState
  selectedNozzleNumberFromSim: number | null
  volume: number
  amount: number
  errorCode: number
}

type SimSnapshot = {
  pumps: SimPumpRaw[]
  serverTime: string
}

type SimTransactionFinalized = {
  pumpId: number
  amount: number
  volume: number
}

type SimEventEnvelope =
  | { type: 'evt'; event: 'forecourt.snapshot'; payload: SimSnapshot }
  | { type: 'evt'; event: 'pump.updated'; payload: SimPumpRaw }
  | {
      type: 'evt'
      event: 'transaction.finalized'
      payload: SimTransactionFinalized
    }
  | { type: 'evt'; event: 'error.changed'; payload: { pumpId: number } }

type SimAckEnvelope =
  | { type: 'ack'; id: string; ok: true }
  | {
      type: 'ack'
      id: string
      ok: false
      error: { code: string; message: string }
    }

type PumpNozzleMapping = {
  nozzleId: string
  nozzleNumber: number
  fuelType?: string | null
  productCode?: string | null
}

type PumpMapping = {
  pumpNumber: number
  nozzles: PumpNozzleMapping[]
}

type PumpMappingsCache = {
  stationId: string
  loadedAt: number
  map: Map<number, PumpMapping>
}

type PendingAck = {
  resolve: () => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type AdapterState = {
  connected: boolean
  reconnectAttempts: number
  lastConnectAt?: number
  lastMessageAt?: number
  lastError?: string
}

let activeSocket: net.Socket | null = null
let buffer = ''
let reconnectTimer: NodeJS.Timeout | null = null
let pumpMappingsCache: PumpMappingsCache | null = null
let stationIdCache: string | null = null
let stationIdPromise: Promise<string | null> | null = null
const pendingAcks = new Map<string, PendingAck>()
const lastPumpState = new Map<number, SimPump>()

declare global {
  var __simTcpNdjsonAdapterStarted: boolean | undefined
  var __simTcpNdjsonAdapterState: AdapterState | undefined
}

const getState = (): AdapterState => {
  if (!globalThis.__simTcpNdjsonAdapterState) {
    globalThis.__simTcpNdjsonAdapterState = {
      connected: false,
      reconnectAttempts: 0,
    }
  }
  return globalThis.__simTcpNdjsonAdapterState
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const resolveStationId = async (): Promise<string | null> => {
  if (stationIdCache) return stationIdCache
  if (stationIdPromise) return stationIdPromise

  stationIdPromise = (async () => {
    const envStation = getStationId()
    if (envStation && isUuid(envStation)) {
      stationIdCache = envStation
      return envStation
    }

    stationIdCache = await fuelStationsRepo.getActiveStationId()
    return stationIdCache
  })()

  try {
    return await stationIdPromise
  } finally {
    stationIdPromise = null
  }
}

const getPumpMappings = async (
  stationId: string,
): Promise<Map<number, PumpMapping>> => {
  if (
    pumpMappingsCache &&
    pumpMappingsCache.stationId === stationId &&
    Date.now() - pumpMappingsCache.loadedAt < PUMP_MAP_TTL_MS
  ) {
    return pumpMappingsCache.map
  }

  const rows = await pumpMappingsRepo.listRowsByStationId(stationId)

  const map = new Map<number, PumpMapping>()
  for (const row of rows) {
    if (!Number.isFinite(row.pump_number ?? NaN)) continue
    const pumpNumber = Number(row.pump_number)
    if (!map.has(pumpNumber)) {
      map.set(pumpNumber, { pumpNumber, nozzles: [] })
    }

    if (row.nozzle_id && Number.isFinite(row.nozzle_number ?? NaN)) {
      const nozzleNumber = Number(row.nozzle_number)
      map.get(pumpNumber)?.nozzles.push({
        nozzleId: row.nozzle_id,
        nozzleNumber,
        fuelType: row.product_name ?? row.product_code ?? null,
        productCode: row.product_code ?? null,
      })
    }
  }

  pumpMappingsCache = { stationId, loadedAt: Date.now(), map }
  return map
}

const mapPumpStateToNozzleState = (
  pump: SimPump,
): 'idle' | 'auth' | 'nozzle_up' | 'nozzle_down' => {
  if (!pump.online) return 'idle'
  switch (pump.state) {
    case 'DISPENSING':
    case 'PAUSED':
      return 'nozzle_up'
    case 'CALL':
      return 'auth'
    case 'TRANS_READY':
      return 'nozzle_down'
    case 'IDLE':
    default:
      return pump.authorized ? 'auth' : 'idle'
  }
}

const resolveNozzleSelection = (
  mapping: PumpMapping | undefined,
  selectedNozzleNumberFromSim: number | null,
): {
  selectedId: string
  selectedNumber: number
  selectedFuel?: string | null
  nozzles: PumpNozzleMapping[]
} => {
  if (!mapping || mapping.nozzles.length === 0) {
    const nozzleId = String(selectedNozzleNumberFromSim ?? 1)
    return {
      selectedId: nozzleId,
      selectedNumber: selectedNozzleNumberFromSim ?? 1,
      selectedFuel: null,
      nozzles: [{ nozzleId, nozzleNumber: selectedNozzleNumberFromSim ?? 1 }],
    }
  }

  const desired =
    (selectedNozzleNumberFromSim != null
      ? mapping.nozzles.find(
          (n) => n.nozzleNumber === selectedNozzleNumberFromSim,
        )
      : undefined) ?? mapping.nozzles[0]

  return {
    selectedId: desired.nozzleId,
    selectedNumber: desired.nozzleNumber,
    selectedFuel: desired.fuelType ?? desired.productCode ?? null,
    nozzles: mapping.nozzles,
  }
}

const buildPumpUpdate = (pump: SimPump, mappings: Map<number, PumpMapping>) => {
  const pumpNumber = Number.isFinite(pump.id) ? pump.id : 0
  const mapping = mappings.get(pumpNumber)
  const nozzleState = mapPumpStateToNozzleState(pump)
  const selection = resolveNozzleSelection(
    mapping,
    pump.selectedNozzleNumberFromSim,
  )

  const nozzles = selection.nozzles.map((nozzle) => ({
    nozzleId: nozzle.nozzleId,
    fuelType: nozzle.fuelType ?? nozzle.productCode ?? undefined,
    state:
      nozzle.nozzleNumber === selection.selectedNumber ? nozzleState : 'idle',
  }))

  if (nozzles.length === 0) {
    nozzles.push({
      nozzleId: selection.selectedId,
      fuelType: selection.selectedFuel ?? undefined,
      state: nozzleState,
    })
  }

  return {
    pumpId: String(pumpNumber),
    nozzles,
  }
}

const publishPos = async (message: Record<string, unknown>) => {
  const bus = getRuntimeBus()
  await bus.publish('pos', message)
}

const handleSnapshot = async (payload: SimSnapshot) => {
  const stationId = await resolveStationId()
  if (!stationId) return

  const mappings = await getPumpMappings(stationId)
  const pumps = payload.pumps.map((pump) => {
    const normalized = normalizeSimPump(pump)
    lastPumpState.set(normalized.id, normalized)
    return buildPumpUpdate(normalized, mappings)
  })

  await publishPos({ stationId, pumps })
}

const handlePumpUpdated = async (payload: SimPumpRaw) => {
  const stationId = await resolveStationId()
  if (!stationId) return

  const mappings = await getPumpMappings(stationId)
  const normalized = normalizeSimPump(payload)
  lastPumpState.set(normalized.id, normalized)
  const update = buildPumpUpdate(normalized, mappings)

  await publishPos({
    stationId,
    type: 'pump_state',
    pumpId: update.pumpId,
    nozzles: update.nozzles,
  })
}

const handleTransactionFinalized = async (payload: SimTransactionFinalized) => {
  const stationId = await resolveStationId()
  if (!stationId) return

  const mappings = await getPumpMappings(stationId)
  const pump = lastPumpState.get(payload.pumpId)
  const pumpNumber = Number.isFinite(payload.pumpId) ? payload.pumpId : 0
  const mapping = mappings.get(pumpNumber)
  const selection = resolveNozzleSelection(
    mapping,
    pump?.selectedNozzleNumberFromSim ?? null,
  )

  await publishPos({
    stationId,
    type: 'transaction',
    pumpId: String(pumpNumber),
    nozzleId: selection.selectedId,
    volume: payload.volume,
    amount: payload.amount,
    fuelType: selection.selectedFuel ?? undefined,
  })
}

const isEventEnvelope = (msg: unknown): msg is SimEventEnvelope => {
  if (!isRecord(msg)) return false
  if (msg.type !== 'evt') return false
  return typeof msg.event === 'string'
}

const normalizeSimPump = (payload: SimPumpRaw): SimPump => {
  const selectedNozzleNumberFromSim =
    typeof payload.gradeSelected === 'number' || payload.gradeSelected === null
      ? payload.gradeSelected
      : null

  return {
    id: payload.id,
    online: payload.online,
    authorized: payload.authorized,
    state: payload.state,
    selectedNozzleNumberFromSim,
    volume: payload.volume,
    amount: payload.amount,
    errorCode: payload.errorCode,
  }
}

const isAckEnvelope = (msg: unknown): msg is SimAckEnvelope => {
  if (!isRecord(msg)) return false
  if (msg.type !== 'ack') return false
  return typeof msg.id === 'string'
}

const handleMessage = (payload: unknown) => {
  const state = getState()
  state.lastMessageAt = Date.now()

  if (isAckEnvelope(payload)) {
    const pending = pendingAcks.get(payload.id)
    if (!pending) return
    pendingAcks.delete(payload.id)
    clearTimeout(pending.timer)
    if (payload.ok) {
      pending.resolve()
    } else {
      pending.reject(
        new Error(payload.error?.message || 'Simulator command failed'),
      )
    }
    return
  }

  if (!isEventEnvelope(payload)) return
  ;(async () => {
    switch (payload.event) {
      case 'forecourt.snapshot':
        await handleSnapshot(payload.payload)
        return
      case 'pump.updated':
        await handlePumpUpdated(payload.payload)
        return
      case 'transaction.finalized':
        await handleTransactionFinalized(payload.payload)
        return
      case 'error.changed':
      default:
        return
    }
  })().catch((err) => {
    logger.error('[sim-tcp-adapter]', {
      msg: 'event handler error',
      error: err,
    })
  })
}

const scheduleReconnect = () => {
  const state = getState()
  if (reconnectTimer) return
  const attempt = state.reconnectAttempts
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, delay)
}

const cleanupSocket = () => {
  if (!activeSocket) return
  activeSocket.removeAllListeners()
  try {
    activeSocket.destroy()
  } catch {}
  activeSocket = null
  buffer = ''
}

const connect = async () => {
  if (!isEnabled()) return

  cleanupSocket()

  const stationId = await getStationId()
  const cfg = stationId
    ? await loadLegacyForecourtNetworkConfigFromDb(stationId)
    : { simHost: '127.0.0.1', simPort: 10000 }
  const host = cfg.simHost
  const port = cfg.simPort

  const state = getState()
  const socket = net.createConnection({ host, port })
  activeSocket = socket

  socket.setNoDelay(true)
  socket.setEncoding('utf8')
  socket.setKeepAlive(true)
  socket.setTimeout(IDLE_TIMEOUT_MS)

  socket.on('connect', () => {
    state.connected = true
    state.lastConnectAt = Date.now()
    state.lastError = undefined
    state.reconnectAttempts = 0
    triggerForecourtCommandProcessing()
  })

  socket.on('data', (chunk: string) => {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
      if (!rawLine.trim()) continue
      try {
        const parsed = JSON.parse(rawLine)
        handleMessage(parsed)
      } catch {
        // ignore invalid json lines
      }
    }
  })

  socket.on('timeout', () => {
    state.lastError = 'Socket idle timeout'
    state.connected = false
    socket.destroy()
  })

  const onCloseOrError = (err?: Error) => {
    state.connected = false
    if (err?.message) {
      state.lastError = err.message
    }
    state.reconnectAttempts += 1
    cleanupSocket()
    scheduleReconnect()
  }

  socket.on('error', onCloseOrError)
  socket.on('close', () => onCloseOrError())
}

const sendLine = (payload: Record<string, unknown>) => {
  if (!activeSocket || activeSocket.destroyed) {
    throw new Error('Simulator TCP socket is not connected')
  }
  activeSocket.write(`${JSON.stringify(payload)}\n`)
}

export const sendSimTcpCommand = async <T extends Record<string, unknown>>(
  action: string,
  payload: T,
  timeoutMs = 5000,
) => {
  if (!isEnabled()) {
    throw new Error('Simulator TCP adapter is disabled')
  }

  const id = uuidv4()
  return await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(id)
      reject(new Error(`Timed out waiting for ack (${timeoutMs}ms)`))
    }, timeoutMs)

    pendingAcks.set(id, { resolve, reject, timer })

    try {
      sendLine({
        type: 'cmd',
        id,
        action,
        payload,
      })
    } catch (err) {
      pendingAcks.delete(id)
      clearTimeout(timer)
      reject(err as Error)
    }
  })
}

export const startSimTcpNdjsonAdapter = () => {
  if (!isEnabled()) return
  if (globalThis.__simTcpNdjsonAdapterStarted) return
  globalThis.__simTcpNdjsonAdapterStarted = true
  void connect()
}

export const getSimTcpNdjsonAdapterState = () => getState()

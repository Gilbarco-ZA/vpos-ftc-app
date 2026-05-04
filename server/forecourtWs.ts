/** @deprecated Legacy server entrypoint support. Keep compatibility only while migrations continue. */
import type {
  ForecourtCommand,
  ForecourtCommandAck,
} from '@/src/shared/forecourt/types'
import type { PumpStateSnapshot } from '@/src/shared/pumps/store'
import type { Server as HttpServer } from 'node:http'
import type { Socket } from 'socket.io'
import { Server as SocketIOServer } from 'socket.io'

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { getJplGatewayState } from '@/src/platform/integrations/jpl/gateway'
import {
  getJplTcpAdapterState,
  getJplTcpBufferHealth,
} from '@/src/shared/forecourt/adapters'
import { ensureGatewayStarted } from '@/src/shared/forecourt/gateway'
import {
  enqueue,
  onForecourtCommandResult,
  startForecourtCommandProcessor,
  triggerForecourtCommandProcessing,
} from '@/src/shared/forecourt/queue'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtime'
import {
  readAdapterState,
  readPumpSnapshot,
} from '@/src/shared/forecourt/sharedState'
import {
  getPumpState,
  startPumpBusListener,
  subscribePumpState,
} from '@/src/shared/pumps/store'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { isUuid } from '@/src/shared/utils/uuid'

import { getForecourtConnectionStatus } from '@/src/modules/forecourt/application/getForecourtConnectionStatus'

declare global {
  // eslint-disable-next-line no-var
  var __vposForecourtWsAttached: boolean | undefined
}

const SAFE_OFFLINE_ACTIONS = new Set([
  'PING',
  'STATUS',
  'GET_STATUS',
  'GET_SNAPSHOT',
  'PUMP_STATE',
  'NOZZLE_STATE',
])

type ClientMeta = {
  stationId: string
}

const clients = new Map<Socket, ClientMeta>()
const commandClients = new Map<string, Socket>()
const lastSharedPumpSnapshotAt = new Map<string, number>()

const sendSnapshot = (socket: Socket, snapshot: PumpStateSnapshot) => {
  socket.emit('message', { type: 'pump:state', data: snapshot })
}

const sendEnvelope = (socket: Socket, payload: Record<string, unknown>) => {
  socket.emit('message', payload)
}

const sendProtocolHealth = (socket: Socket, stationId: string) => {
  const gatewayState: any = getJplGatewayState() as any
  sendEnvelope(socket, {
    type: 'forecourt:protocol',
    data: {
      stationId,
      ...(gatewayState?.protocolHealth ?? gatewayState?.protocol ?? {}),
    },
  })
}

type ForecourtConnectionStatus = 'online' | 'offline' | 'degraded'

const selectAdapterState = (
  localAdapterState: ReturnType<typeof getJplTcpAdapterState>,
  sharedAdapterState: Awaited<ReturnType<typeof readAdapterState>> | null,
) => {
  if (!sharedAdapterState) return localAdapterState

  const localLastSeen =
    localAdapterState.lastMessageAt ?? localAdapterState.lastConnectAt ?? 0
  const sharedLastSeen =
    sharedAdapterState.lastMessageAt ?? sharedAdapterState.lastConnectAt ?? 0

  // Do not let a stale persisted offline snapshot override a live in-process connection.
  if (localAdapterState.connected && !sharedAdapterState.connected) {
    return localAdapterState
  }

  if (sharedAdapterState.connected && !localAdapterState.connected) {
    return sharedAdapterState
  }

  return localLastSeen >= sharedLastSeen
    ? localAdapterState
    : sharedAdapterState
}

const FORECOURT_FRESH_MS = 30_000
const FORECOURT_STALE_MS = 5 * 60_000

const getLastPersistedForecourtSeenAt = async (stationId?: string) => {
  if (!stationId) return null

  const row = await queryOne<{ last_seen_at: string | null }>(
    `
      SELECT MAX(received_at)::text AS last_seen_at
        FROM forecourt_events
       WHERE station_id = $1
         AND source IN ('jpl_tcp', 'ftc')
    `,
    [stationId],
  )

  if (!row?.last_seen_at) return null

  const ts = new Date(row.last_seen_at).getTime()
  return Number.isFinite(ts) ? ts : null
}

const resolveForecourtStatus = async (stationId?: string) => {
  const localAdapterState = getJplTcpAdapterState()
  const sharedAdapterState = stationId
    ? await readAdapterState(stationId)
    : null
  const adapterState = selectAdapterState(localAdapterState, sharedAdapterState)

  const connected = Boolean(adapterState.connected)
  const reconnectAttempts = Number(adapterState.reconnectAttempts ?? 0)

  const runtimeLastSeenAt =
    adapterState.lastMessageAt ?? adapterState.lastConnectAt ?? null

  const persistedLastSeenAt = await getLastPersistedForecourtSeenAt(stationId)

  const lastSeenAt = runtimeLastSeenAt ?? persistedLastSeenAt ?? null

  const ageMs =
    lastSeenAt == null ? Number.POSITIVE_INFINITY : Date.now() - lastSeenAt

  let status: ForecourtConnectionStatus = 'offline'

  if (connected && ageMs <= FORECOURT_FRESH_MS) {
    status = 'online'
  } else if (connected || ageMs <= FORECOURT_STALE_MS) {
    status = 'degraded'
  } else {
    status = 'offline'
  }

  return {
    status,
    lastSeenAt,
    reconnectAttempts,
  }
}

const isRiskyAction = (action: string) =>
  !SAFE_OFFLINE_ACTIONS.has(action.trim().toUpperCase())

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const parseCommand = (value: unknown): ForecourtCommand | null => {
  if (!isRecord(value)) return null

  const id = String(value.id ?? '').trim()
  const stationId = String(value.stationId ?? '').trim()
  const action = String(value.action ?? '').trim()
  const pumpNumber = value.pumpNumber
  const nozzleNumber = value.nozzleNumber
  const payload = value.payload
  const issuedAt = value.issuedAt

  if (!id || !stationId || !action) return null
  if (!isFiniteNumber(pumpNumber)) return null
  if (nozzleNumber != null && !isFiniteNumber(nozzleNumber)) return null
  if (!isRecord(payload)) return null
  if (!isFiniteNumber(issuedAt)) return null

  return {
    id,
    stationId,
    action,
    pumpNumber,
    nozzleNumber: nozzleNumber ?? undefined,
    payload,
    issuedAt,
  }
}

type NozzleValidationResult =
  | { ok: true; nozzleNumber?: number }
  | { ok: false; reason: string }

const validateNozzleForCommand = async (
  stationId: string,
  pumpNumber: number,
  nozzleNumber?: number,
): Promise<NozzleValidationResult> => {
  const rows = await queryAll<{
    has_nozzle_selector: boolean
    nozzle_number: number | null
  }>(
    `SELECT p.has_nozzle_selector,
            n.nozzle_number
       FROM pumps p
       LEFT JOIN nozzles n
         ON n.pump_id = p.id
        AND n.station_id = p.station_id
      WHERE p.station_id = $1
        AND p.pump_number = $2`,
    [stationId, pumpNumber],
  )

  if (!rows.length) {
    return { ok: false, reason: 'invalid pump' }
  }

  const hasSelector = Boolean(rows[0]?.has_nozzle_selector)
  const nozzleNumbers = rows
    .map((row) => row.nozzle_number)
    .filter((value): value is number => typeof value === 'number')
  const uniqueNozzles = Array.from(new Set(nozzleNumbers))

  if (typeof nozzleNumber === 'number') {
    if (uniqueNozzles.includes(nozzleNumber)) {
      return { ok: true, nozzleNumber }
    }
    return { ok: false, reason: 'invalid nozzle' }
  }

  if (hasSelector) {
    return { ok: false, reason: 'nozzle required' }
  }

  if (uniqueNozzles.length === 1) {
    return { ok: true, nozzleNumber: uniqueNozzles[0] }
  }

  return { ok: false, reason: 'nozzle required' }
}

let stationIdCache: string | null = null
let stationIdPromise: Promise<string | null> | null = null

const resolveStationId = async (candidate?: string | null) => {
  if (candidate && isUuid(candidate)) return candidate

  if (stationIdCache) return stationIdCache
  if (stationIdPromise) return stationIdPromise

  stationIdPromise = (async () => {
    const envStation = getStationId()
    if (envStation && isUuid(envStation)) {
      stationIdCache = envStation
      return envStation
    }

    const row = await queryOne<{ id: string }>(
      `SELECT id FROM fuel_stations WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1`,
    )
    stationIdCache = row?.id ?? null
    return stationIdCache
  })()

  try {
    return await stationIdPromise
  } finally {
    stationIdPromise = null
  }
}

const broadcastSnapshot = (snapshot: PumpStateSnapshot) => {
  for (const [socket, meta] of clients.entries()) {
    if (meta.stationId !== snapshot.stationId) continue
    sendSnapshot(socket, snapshot)
    sendEnvelope(socket, {
      type: 'forecourt:health',
      data: {
        stationId: snapshot.stationId,
        pumps: snapshot.pumps.map((pump) => ({
          pumpId: pump.pumpId,
          health: pump.health,
          lastSeenAt: pump.lastSeenAt ?? null,
        })),
        updatedAt: snapshot.updatedAt,
      },
    })
  }
}

const normalizeEnvelope = (raw: unknown) => {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (isRecord(raw)) return raw
  return null
}

const resolveStationIdFromSocket = (socket: Socket) => {
  const queryValue = socket.handshake.query.stationId
  if (Array.isArray(queryValue)) return String(queryValue[0] ?? '')
  if (typeof queryValue === 'string') return queryValue
  if (queryValue == null) return ''
  return String(queryValue)
}

export function attachForecourtWs(server: HttpServer) {
  if (globalThis.__vposForecourtWsAttached) return
  globalThis.__vposForecourtWsAttached = true

  // Ensure forecourt data-plane services are running in the same process.
  ensureGatewayStarted()
  startPumpBusListener()
  startForecourtCommandProcessor()

  // Forward command confirmations/timeouts (and any future forecourt events) to connected clients.
  const bus = getRuntimeBus()
  bus.subscribe('pos', (msg: any) => {
    if (!msg || typeof msg !== 'object') return
    const t = msg.type
    if (t === 'command_confirmed' || t === 'command_timeout') {
      for (const [socket, meta] of clients.entries()) {
        // Optional: station filter
        if (msg.stationId && meta.stationId && msg.stationId !== meta.stationId)
          continue
        sendEnvelope(socket, {
          type: `cmd:${t === 'command_confirmed' ? 'confirmed' : 'timeout'}`,
          data: msg,
        })
      }
    }
  })

  const io = new SocketIOServer(server, {
    path: '/ws/forecourt',
    transports: ['websocket'],
    // upgrade: false,
    serveClient: false,
  })

  subscribePumpState((snapshot) => {
    broadcastSnapshot(snapshot)
  })

  onForecourtCommandResult((result) => {
    const socket = commandClients.get(result.id)
    if (!socket) return
    sendEnvelope(socket, { type: 'cmd:result', data: result })
    commandClients.delete(result.id)
  })

  setInterval(() => {
    void (async () => {
      const stationIds = Array.from(
        new Set(Array.from(clients.values()).map((meta) => meta.stationId)),
      )
      const statusByStation = new Map<
        string,
        Awaited<ReturnType<typeof resolveForecourtStatus>>
      >()

      for (const stationId of stationIds) {
        const status = await getForecourtConnectionStatus(stationId)
        statusByStation.set(stationId, status)

        const sharedSnapshot = await readPumpSnapshot(stationId)
        if (sharedSnapshot) {
          const lastSentAt = lastSharedPumpSnapshotAt.get(stationId) ?? 0
          if ((sharedSnapshot.updatedAt ?? 0) > lastSentAt) {
            lastSharedPumpSnapshotAt.set(
              stationId,
              sharedSnapshot.updatedAt ?? Date.now(),
            )
            broadcastSnapshot(sharedSnapshot)
          }
        }
      }

      for (const [socket, meta] of clients.entries()) {
        const status = statusByStation.get(meta.stationId)
        if (!status) continue
        sendEnvelope(socket, {
          type: 'forecourt:conn',
          data: {
            stationId: meta.stationId,
            status: status.status,
            lastSeenAt: status.lastSeenAt,
            reconnectAttempts: status.reconnectAttempts,
          },
        })
        sendProtocolHealth(socket, meta.stationId)
      }
    })()

    const buf = getJplTcpBufferHealth()
    const supervised = Object.values(buf.supervised ?? {}).sort(
      (a, b) => a.pumpId - b.pumpId,
    )
    const unsupervised = Object.values(buf.unsupervised ?? {}).sort(
      (a, b) => a.pumpId - b.pumpId,
    )
    for (const [socket, meta] of clients.entries()) {
      sendEnvelope(socket, {
        type: 'forecourt:buffer',
        data: {
          stationId: meta.stationId,
          updatedAt: buf.updatedAt,
          supervised,
          unsupervised,
          thresholds: {
            bufferWarnDepthSup: getForecourtRuntimeConfig().bufferWarnDepthSup,
            bufferCritDepthSup: getForecourtRuntimeConfig().bufferCritDepthSup,
            bufferWarnAgeMinSup:
              getForecourtRuntimeConfig().bufferWarnAgeMinSup,
            bufferCritAgeMinSup:
              getForecourtRuntimeConfig().bufferCritAgeMinSup,
            bufferWarnDepthUnsup:
              getForecourtRuntimeConfig().bufferWarnDepthUnsup,
            bufferCritDepthUnsup:
              getForecourtRuntimeConfig().bufferCritDepthUnsup,
            bufferWarnAgeMinUnsup:
              getForecourtRuntimeConfig().bufferWarnAgeMinUnsup,
            bufferCritAgeMinUnsup:
              getForecourtRuntimeConfig().bufferCritAgeMinUnsup,
          },
        },
      })
    }
  }, 2000)

  io.on('connection', (socket) => {
    void (async () => {
      const stationId = await resolveStationId(
        resolveStationIdFromSocket(socket),
      )
      if (!stationId) {
        sendEnvelope(socket, {
          type: 'error',
          data: { message: 'Missing stationId' },
        })
        socket.disconnect(true)
        return
      }

      clients.set(socket, { stationId })
      const initialSnapshot =
        (await readPumpSnapshot(stationId)) ?? getPumpState(stationId)
      sendSnapshot(socket, initialSnapshot)
      sendEnvelope(socket, {
        type: 'forecourt:health',
        data: {
          stationId: initialSnapshot.stationId,
          pumps: initialSnapshot.pumps.map((pump) => ({
            pumpId: pump.pumpId,
            health: pump.health,
            lastSeenAt: pump.lastSeenAt ?? null,
          })),
          updatedAt: initialSnapshot.updatedAt,
        },
      })
      const connStatus = await getForecourtConnectionStatus(stationId)
      sendEnvelope(socket, {
        type: 'forecourt:conn',
        data: {
          stationId,
          status: connStatus.status,
          lastSeenAt: connStatus.lastSeenAt,
          reconnectAttempts: connStatus.reconnectAttempts,
        },
      })
      sendProtocolHealth(socket, stationId)

      const handleCommandEnvelope = (payload: unknown) => {
        void (async () => {
          const parsed = normalizeEnvelope(payload)
          if (!isRecord(parsed)) return
          if (parsed.type !== 'cmd') return

          const cmd = parseCommand(parsed.data)
          const now = Date.now()

          if (!cmd || cmd.stationId !== stationId) {
            const ack: ForecourtCommandAck = {
              id: cmd?.id ?? String((parsed as any)?.data?.id ?? ''),
              stationId,
              pumpNumber: cmd?.pumpNumber ?? 0,
              nozzleNumber: cmd?.nozzleNumber,
              status: 'rejected',
              reason: cmd ? 'Station mismatch' : 'Invalid command payload',
              timestamp: now,
            }
            sendEnvelope(socket, { type: 'cmd:ack', data: ack })
            return
          }

          const nozzleCheck = await validateNozzleForCommand(
            cmd.stationId,
            cmd.pumpNumber,
            cmd.nozzleNumber,
          )

          if (!nozzleCheck.ok) {
            const ack: ForecourtCommandAck = {
              id: cmd.id,
              stationId: cmd.stationId,
              pumpNumber: cmd.pumpNumber,
              nozzleNumber: cmd.nozzleNumber,
              status: 'rejected',
              reason: nozzleCheck.reason,
              timestamp: Date.now(),
            }
            sendEnvelope(socket, { type: 'cmd:ack', data: ack })
            return
          }

          const normalizedCmd: ForecourtCommand = nozzleCheck.nozzleNumber
            ? { ...cmd, nozzleNumber: nozzleCheck.nozzleNumber }
            : cmd

          const connStatus = await getForecourtConnectionStatus(stationId)
          if (connStatus.status === 'offline' && isRiskyAction(cmd.action)) {
            const ack: ForecourtCommandAck = {
              id: normalizedCmd.id,
              stationId: normalizedCmd.stationId,
              pumpNumber: normalizedCmd.pumpNumber,
              nozzleNumber: normalizedCmd.nozzleNumber,
              status: 'rejected',
              reason: 'forecourt offline',
              timestamp: Date.now(),
            }
            sendEnvelope(socket, { type: 'cmd:ack', data: ack })
            return
          }

          const ack: ForecourtCommandAck = {
            id: normalizedCmd.id,
            stationId: normalizedCmd.stationId,
            pumpNumber: normalizedCmd.pumpNumber,
            nozzleNumber: normalizedCmd.nozzleNumber,
            status: 'accepted',
            timestamp: now,
          }
          sendEnvelope(socket, { type: 'cmd:ack', data: ack })

          commandClients.set(normalizedCmd.id, socket)
          await enqueue(normalizedCmd)
          triggerForecourtCommandProcessing()
        })()
      }

      socket.on('message', handleCommandEnvelope)
      socket.on('cmd', (data) => handleCommandEnvelope({ type: 'cmd', data }))

      socket.on('disconnect', () => {
        clients.delete(socket)
        for (const [id, client] of commandClients.entries()) {
          if (client === socket) commandClients.delete(id)
        }
      })
    })()
  })
}

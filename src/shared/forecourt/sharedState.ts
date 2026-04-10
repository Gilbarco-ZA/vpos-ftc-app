import type { JplTcpAdapterState } from '@/src/shared/forecourt/jplState'
import type { PumpStateSnapshot } from '@/src/shared/pumps/types'

import { queryOne } from '@/src/platform/db/postgres'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { logger } from '@/src/shared/utils/logger'

const FORECOURT_KV_KEYS = {
  ADAPTER_STATE: 'forecourt.adapter.state',
  PUMP_STATE: 'forecourt.pump.state',
} as const

const ADAPTER_LAST_MESSAGE_BUCKET_MS = 5_000
const PUMP_LAST_SEEN_BUCKET_MS = 15_000
const ADAPTER_PERSIST_DEBOUNCE_MS = 750
const PUMP_PERSIST_DEBOUNCE_MS = 1_000

type PersistMemoEntry = {
  fingerprint: string
  persistedAt: number
}

type PendingPersistEntry = {
  fingerprint: string
  value: unknown
  debounceMs: number
  timer: ReturnType<typeof setTimeout> | null
  flushPromise: Promise<boolean> | null
  resolveQueue: Array<(value: boolean) => void>
  rejectQueue: Array<(reason?: unknown) => void>
}

function getPersistMemo() {
  const g = globalThis as any
  if (!g.__vposForecourtPersistMemo) {
    g.__vposForecourtPersistMemo = new Map<string, PersistMemoEntry>()
  }
  return g.__vposForecourtPersistMemo as Map<string, PersistMemoEntry>
}

function getPendingPersists() {
  const g = globalThis as any
  if (!g.__vposForecourtPendingPersists) {
    g.__vposForecourtPendingPersists = new Map<string, PendingPersistEntry>()
  }
  return g.__vposForecourtPendingPersists as Map<string, PendingPersistEntry>
}

function normalizeStationId(value: string) {
  return String(value ?? '').trim()
}

function fingerprintAdapterState(state: JplTcpAdapterState) {
  const lastMessageAt =
    state.lastMessageAt != null
      ? Math.floor(Number(state.lastMessageAt) / ADAPTER_LAST_MESSAGE_BUCKET_MS)
      : null

  return JSON.stringify({
    connected: Boolean(state.connected),
    reconnectAttempts: Number(state.reconnectAttempts ?? 0),
    lastMessageAt,
    lastConnectAt:
      state.lastConnectAt != null ? Number(state.lastConnectAt) : null,
    lastError: state.lastError ?? null,
  })
}

function fingerprintPumpSnapshot(snapshot: PumpStateSnapshot) {
  const pumps = [...(snapshot.pumps ?? [])]
    .map((pump) => ({
      pumpId: String(pump.pumpId ?? ''),
      health: pump.health ?? 'unknown',
      lastSeenBucket:
        pump.lastSeenAt != null
          ? Math.floor(Number(pump.lastSeenAt) / PUMP_LAST_SEEN_BUCKET_MS)
          : null,
      nozzles: [...(pump.nozzles ?? [])]
        .map((nozzle) => ({
          nozzleId: String(nozzle.nozzleId ?? ''),
          fuelType: nozzle.fuelType ?? null,
          state: nozzle.state ?? 'idle',
        }))
        .sort((a, b) => a.nozzleId.localeCompare(b.nozzleId)),
    }))
    .sort((a, b) => a.pumpId.localeCompare(b.pumpId))

  return JSON.stringify({
    stationId: normalizeStationId(snapshot.stationId),
    pumps,
  })
}

async function resolveStationId(stationId: string) {
  const normalized = normalizeStationId(stationId)
  if (normalized) return normalized
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM fuel_stations ORDER BY created_at ASC LIMIT 1',
    [],
  )
  return row?.id ?? null
}

async function persistIfChanged<T>(args: {
  stationId: string
  key: string
  value: T
  fingerprint: string
  debounceMs?: number
}) {
  const memo = getPersistMemo()
  const pending = getPendingPersists()
  const memoKey = `${args.stationId}:${args.key}`
  const current = memo.get(memoKey)
  if (current?.fingerprint === args.fingerprint) return false

  const debounceMs = Math.max(0, Number(args.debounceMs ?? 0))
  if (debounceMs <= 0) {
    await kvSet<T>(args.stationId, args.key, args.value)
    memo.set(memoKey, {
      fingerprint: args.fingerprint,
      persistedAt: Date.now(),
    })
    return true
  }

  const existing = pending.get(memoKey)
  if (existing?.fingerprint === args.fingerprint && existing.flushPromise) {
    return await existing.flushPromise
  }

  const entry: PendingPersistEntry = existing ?? {
    fingerprint: args.fingerprint,
    value: args.value,
    debounceMs,
    timer: null,
    flushPromise: null,
    resolveQueue: [],
    rejectQueue: [],
  }

  entry.fingerprint = args.fingerprint
  entry.value = args.value
  entry.debounceMs = debounceMs

  if (entry.timer) clearTimeout(entry.timer)

  entry.flushPromise = new Promise<boolean>((resolve, reject) => {
    entry.resolveQueue.push(resolve)
    entry.rejectQueue.push(reject)
  })

  entry.timer = setTimeout(() => {
    void (async () => {
      const queuedResolvers = [...entry.resolveQueue]
      const queuedRejectors = [...entry.rejectQueue]
      entry.resolveQueue = []
      entry.rejectQueue = []
      entry.timer = null
      try {
        const latestMemo = memo.get(memoKey)
        if (latestMemo?.fingerprint === entry.fingerprint) {
          pending.delete(memoKey)
          for (const resolve of queuedResolvers) resolve(false)
          return
        }

        await kvSet<T>(args.stationId, args.key, entry.value as T)
        memo.set(memoKey, {
          fingerprint: entry.fingerprint,
          persistedAt: Date.now(),
        })
        pending.delete(memoKey)
        for (const resolve of queuedResolvers) resolve(true)
      } catch (error) {
        pending.delete(memoKey)
        for (const reject of queuedRejectors) reject(error)
      }
    })()
  }, debounceMs)

  pending.set(memoKey, entry)
  return await entry.flushPromise
}

export async function persistAdapterState(
  stationId: string,
  state: JplTcpAdapterState,
) {
  const resolvedStationId = await resolveStationId(stationId)
  if (!resolvedStationId) return

  await persistIfChanged<JplTcpAdapterState>({
    stationId: resolvedStationId,
    key: FORECOURT_KV_KEYS.ADAPTER_STATE,
    value: state,
    fingerprint: fingerprintAdapterState(state),
    debounceMs: ADAPTER_PERSIST_DEBOUNCE_MS,
  })
}

export async function readAdapterState(stationId: string) {
  try {
    return await kvGet<JplTcpAdapterState>(
      normalizeStationId(stationId),
      FORECOURT_KV_KEYS.ADAPTER_STATE,
    )
  } catch (error) {
    logger.warn('forecourt-shared-state', {
      msg: 'failed to read adapter state',
      stationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function persistPumpSnapshot(
  stationId: string,
  snapshot: PumpStateSnapshot,
) {
  const resolvedStationId = await resolveStationId(stationId)
  if (!resolvedStationId) return

  await persistIfChanged<PumpStateSnapshot>({
    stationId: resolvedStationId,
    key: FORECOURT_KV_KEYS.PUMP_STATE,
    value: snapshot,
    fingerprint: fingerprintPumpSnapshot(snapshot),
    debounceMs: PUMP_PERSIST_DEBOUNCE_MS,
  })
}

export async function readPumpSnapshot(stationId: string) {
  try {
    return await kvGet<PumpStateSnapshot>(
      normalizeStationId(stationId),
      FORECOURT_KV_KEYS.PUMP_STATE,
    )
  } catch (error) {
    logger.warn('forecourt-shared-state', {
      msg: 'failed to read pump snapshot',
      stationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

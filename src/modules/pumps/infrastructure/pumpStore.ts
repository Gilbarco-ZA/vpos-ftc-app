import type {
  NozzleState,
  PumpHealth,
  PumpNozzle,
  PumpState,
  PumpStateSnapshot,
} from '@/src/shared/pumps/types'

import { ensureGatewayStarted } from '@/src/shared/forecourt/gateway'
import { persistPumpSnapshot } from '@/src/shared/forecourt/sharedState'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { logger } from '@/src/shared/utils/logger'

import {
  cleanupStalePendingAuths,
  handlePumpEventMessage,
  handlePumpStateChange,
} from '@/src/modules/pumps/infrastructure/transactionHandler'

export type {
  NozzleState,
  PumpHealth,
  PumpNozzle,
  PumpState,
  PumpStateSnapshot,
}

type PumpStore = {
  snapshots: Map<string, PumpStateSnapshot>
  listeners: Set<(snapshot: PumpStateSnapshot) => void>
  started: boolean
}

const HEALTH_THRESHOLD_MS = 30_000

const getStore = (): PumpStore => {
  const anyGlobal = globalThis as any
  if (!anyGlobal.__vposPumpStore) {
    anyGlobal.__vposPumpStore = {
      snapshots: new Map<string, PumpStateSnapshot>(),
      listeners: new Set<(snapshot: PumpStateSnapshot) => void>(),
      started: false,
    } satisfies PumpStore
  }
  return anyGlobal.__vposPumpStore as PumpStore
}

const normalizeState = (value: unknown): NozzleState => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return 'idle'
  if (raw.includes('nozzle up') || raw.includes('nozzle_up') || raw === 'up') {
    return 'nozzle_up'
  }
  if (raw.includes('auth')) return 'auth'
  if (
    raw.includes('nozzle down') ||
    raw.includes('nozzle_down') ||
    raw === 'down'
  ) {
    return 'nozzle_down'
  }
  if (raw.includes('idle')) return 'idle'
  return raw
}

const ensurePump = (snapshot: PumpStateSnapshot, pumpId: string): PumpState => {
  const existing = snapshot.pumps.find((p) => p.pumpId === pumpId)
  if (existing) return existing
  const pump: PumpState = {
    pumpId,
    nozzles: [],
    updatedAt: Date.now(),
    lastSeenAt: null,
    health: 'unknown',
  }
  snapshot.pumps.push(pump)
  return pump
}

const resolveHealth = (lastSeenAt: number | null): PumpHealth => {
  if (!lastSeenAt) return 'unknown'
  return Date.now() - lastSeenAt > HEALTH_THRESHOLD_MS ? 'offline' : 'online'
}

const refreshSnapshotHealth = (snapshot: PumpStateSnapshot) => {
  let changed = false
  for (const pump of snapshot.pumps) {
    const next = resolveHealth(pump.lastSeenAt)
    if (pump.health !== next) {
      pump.health = next
      changed = true
    }
  }
  return changed
}

const upsertNozzle = (
  pump: PumpState,
  nozzleId: string,
  next: Partial<PumpNozzle>,
) => {
  const existing = pump.nozzles.find((n) => n.nozzleId === nozzleId)
  const updatedAt = Date.now()
  if (existing) {
    Object.assign(existing, next, { updatedAt })
  } else {
    pump.nozzles.push({
      nozzleId,
      fuelType: next.fuelType,
      state: next.state ?? 'idle',
      updatedAt,
    })
  }
  pump.updatedAt = updatedAt
  pump.lastSeenAt = updatedAt
  pump.health = 'online'
}

const notify = (snapshot: PumpStateSnapshot) => {
  const store = getStore()
  refreshSnapshotHealth(snapshot)
  for (const listener of store.listeners) {
    try {
      listener(snapshot)
    } catch {}
  }

  // Trigger transaction handler for state changes
  handlePumpStateChange(snapshot).catch((err) => {
    logger.error('[pump-store]', {
      msg: 'Transaction handler error',
      error: err,
    })
  })

  void persistPumpSnapshot(snapshot.stationId, snapshot)
}

export const getPumpState = (stationId: string): PumpStateSnapshot => {
  const store = getStore()
  const existing = store.snapshots.get(stationId)
  if (existing) return existing

  const snapshot: PumpStateSnapshot = {
    stationId,
    pumps: [],
    updatedAt: Date.now(),
  }
  store.snapshots.set(stationId, snapshot)
  return snapshot
}

export const updatePumpState = (
  stationId: string,
  update: {
    pumpId: string
    nozzles: Array<{
      nozzleId: string
      fuelType?: string
      state: NozzleState
    }>
  },
) => {
  const snapshot = getPumpState(stationId)
  const pump = ensurePump(snapshot, update.pumpId)
  const seenAt = Date.now()

  if (!Array.isArray(update.nozzles) || update.nozzles.length === 0) {
    pump.updatedAt = seenAt
    pump.lastSeenAt = seenAt
    pump.health = 'online'
  } else {
    for (const nozzle of update.nozzles) {
      upsertNozzle(pump, nozzle.nozzleId, {
        fuelType: nozzle.fuelType,
        state: normalizeState(nozzle.state),
      })
    }
  }

  snapshot.updatedAt = seenAt
  notify(snapshot)
}

export const applyPumpMessage = (msg: any) => {
  logger.debug('[pump-store]', { msg: 'APPLY PUMP MESSAGE', payload: msg })
  if (!msg || typeof msg !== 'object') return
  const stationId = String(msg.stationId ?? msg.station_id ?? '')
  if (!stationId) return

  const type = String(msg.type ?? msg.event ?? '').toLowerCase()

  if (Array.isArray(msg.pumps)) {
    for (const pump of msg.pumps) {
      const pumpId = String(pump.pumpId ?? pump.id ?? '')
      if (!pumpId) continue
      const nozzles = Array.isArray(pump.nozzles) ? pump.nozzles : []
      updatePumpState(stationId, {
        pumpId,
        nozzles: nozzles.map((n: any) => ({
          nozzleId: String(n.nozzleId ?? n.id ?? ''),
          fuelType: n.fuelType ?? n.productCode ?? n.gradeName ?? undefined,
          state: normalizeState(n.state ?? n.status ?? 'idle'),
        })),
      })
    }
    return
  }

  if (type === 'nozzle_state' || type === 'nozzle-state' || type === 'nozzle') {
    const pumpId = String(msg.pumpId ?? msg.pump_id ?? '')
    const nozzleId = String(msg.nozzleId ?? msg.nozzle_id ?? '')
    if (!pumpId || !nozzleId) return
    updatePumpState(stationId, {
      pumpId,
      nozzles: [
        {
          nozzleId,
          fuelType:
            msg.fuelType ?? msg.productCode ?? msg.gradeName ?? undefined,
          state: normalizeState(msg.state ?? msg.status ?? 'idle'),
        },
      ],
    })
    return
  }

  if (type === 'pump_state' || type === 'pump-state' || type === 'pump') {
    const pumpId = String(msg.pumpId ?? msg.pump_id ?? '')
    if (!pumpId) return
    const nozzles = Array.isArray(msg.nozzles) ? msg.nozzles : []
    if (nozzles.length) {
      updatePumpState(stationId, {
        pumpId,
        nozzles: nozzles.map((n: any) => ({
          nozzleId: String(n.nozzleId ?? n.id ?? ''),
          fuelType: n.fuelType ?? n.productCode ?? n.gradeName ?? undefined,
          state: normalizeState(n.state ?? n.status ?? 'idle'),
        })),
      })
    }
  }
}

export const subscribePumpState = (
  listener: (snapshot: PumpStateSnapshot) => void,
) => {
  const store = getStore()
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

export const startPumpBusListener = () => {
  const store = getStore()
  if (store.started) return
  store.started = true

  ensureGatewayStarted()

  const bus = getRuntimeBus()
  bus.subscribe('pos', (msg: any) => {
    try {
      // Process event message first (may contain volume/amount data)
      handlePumpEventMessage(msg).catch((err) => {
        logger.error('[pump-store]', {
          msg: 'Event message handler error',
          error: err,
        })
      })
      // Then update state
      applyPumpMessage(msg)
    } catch {}
  })

  // Cleanup stale pending auths every 5 minutes
  setInterval(
    () => {
      try {
        cleanupStalePendingAuths()
      } catch (err) {
        logger.error('[pump-store]', { msg: 'Cleanup error', error: err })
      }
    },
    5 * 60 * 1000,
  )

  setInterval(() => {
    const snapshots = Array.from(getStore().snapshots.values())
    for (const snapshot of snapshots) {
      if (refreshSnapshotHealth(snapshot)) {
        snapshot.updatedAt = Date.now()
        notify(snapshot)
      }
    }
  }, 2000)
}

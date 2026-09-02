import '@/src/modules/forecourt/infrastructure/jpl/globals'

import {
  getJplAdapterState,
  setJplAdapterState,
} from '@/src/shared/forecourt/jplState'
import { persistAdapterState } from '@/src/shared/forecourt/sharedState'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'

import { recordForecourtEvent } from '@/src/modules/forecourt/infrastructure/persistence'

export const syncAdapterState = (
  stationId: string,
  next: Partial<ReturnType<typeof getJplAdapterState>>,
) => {
  setJplAdapterState(next)
  const snapshot = getJplAdapterState()
  void persistAdapterState(stationId, snapshot).catch((error) => {
    logger.warn('[jplTcp]', {
      msg: 'adapter state persistence failed',
      stationId,
      error: serializeError(error),
    })
  })
}

const getPersistDedupe = () => {
  if (!globalThis.__jplPersistDedupe) {
    globalThis.__jplPersistDedupe = new Map()
  }
  return globalThis.__jplPersistDedupe
}

const shouldPersistEventType = (eventType: string) => {
  if (!eventType) return false
  if (eventType === 'heartbeat_00H') return false
  if (eventType === 'jpl_00H') return false
  return true
}

type PersistJplEventArgs = {
  stationId: string
  eventType: string
  payload: any
  occurredAt: Date | number | string
}

type PersistJplEventJob = {
  args: PersistJplEventArgs
  queuedAt: number
  resolve: () => void
  reject: (error: unknown) => void
}

type JplPersistenceQueueState = {
  pending: PersistJplEventJob[]
  active: number
  enqueued: number
  completed: number
  failed: number
  lastPressureLogAt: number
}

type JplPersistenceGlobals = typeof globalThis & {
  __vposJplPersistenceQueue?: JplPersistenceQueueState
}

const persistenceGlobals = () => globalThis as JplPersistenceGlobals

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

const getJplPersistenceConcurrency = () =>
  boundedEnvInt('VPOS_JPL_PERSIST_CONCURRENCY', 2, 1, 4)

const getJplPersistenceQueue = () => {
  const globals = persistenceGlobals()
  if (!globals.__vposJplPersistenceQueue) {
    globals.__vposJplPersistenceQueue = {
      pending: [],
      active: 0,
      enqueued: 0,
      completed: 0,
      failed: 0,
      lastPressureLogAt: 0,
    }
  }
  return globals.__vposJplPersistenceQueue
}

export const getJplPersistenceQueueDiagnostics = () => {
  const queue = getJplPersistenceQueue()
  const oldestQueuedAt = queue.pending[0]?.queuedAt ?? null
  return {
    active: queue.active,
    queued: queue.pending.length,
    concurrency: getJplPersistenceConcurrency(),
    enqueued: queue.enqueued,
    completed: queue.completed,
    failed: queue.failed,
    oldestQueuedMs:
      oldestQueuedAt == null ? 0 : Math.max(0, Date.now() - oldestQueuedAt),
  }
}

const drainJplPersistenceQueue = () => {
  const queue = getJplPersistenceQueue()
  const concurrency = getJplPersistenceConcurrency()

  while (queue.active < concurrency && queue.pending.length > 0) {
    const job = queue.pending.shift()!
    queue.active += 1

    void recordForecourtEvent({
      stationId: job.args.stationId,
      source: 'jpl_tcp',
      eventType: job.args.eventType,
      payload: job.args.payload,
      occurredAt: job.args.occurredAt,
    })
      .then(() => {
        queue.completed += 1
        job.resolve()
      })
      .catch((error) => {
        queue.failed += 1
        job.reject(error)
      })
      .finally(() => {
        queue.active -= 1
        queueMicrotask(drainJplPersistenceQueue)
      })
  }
}

const enqueueJplPersistence = (args: PersistJplEventArgs) => {
  const queue = getJplPersistenceQueue()
  queue.enqueued += 1

  const promise = new Promise<void>((resolve, reject) => {
    queue.pending.push({
      args,
      queuedAt: Date.now(),
      resolve,
      reject,
    })
  })

  if (queue.pending.length >= 64) {
    const now = Date.now()
    if (now - queue.lastPressureLogAt >= 30_000) {
      queue.lastPressureLogAt = now
      logger.warn('[jplTcp]', {
        msg: 'event persistence backlog',
        queue: getJplPersistenceQueueDiagnostics(),
      })
    }
  }

  queueMicrotask(drainJplPersistenceQueue)
  return promise
}

export const persistJplEventOnce = async (args: PersistJplEventArgs) => {
  const { stationId, eventType, payload } = args
  if (!shouldPersistEventType(eventType)) return

  const dedupe = getPersistDedupe()
  const key = JSON.stringify([
    stationId,
    eventType,
    payload?.FpId ?? null,
    payload?.TransSeqNo ?? null,
    payload?.MoneyDue ?? null,
    payload?.Vol ?? null,
  ])

  const now = Date.now()
  const last = dedupe.get(key) ?? 0
  if (now - last < 3_000) return
  dedupe.set(key, now)

  if (dedupe.size > 5000) {
    for (const [k, ts] of dedupe.entries()) {
      if (now - ts > 60_000) dedupe.delete(k)
    }
  }

  // Keep controller message handling decoupled from PostgreSQL connection
  // acquisition. Transaction-bearing events are never discarded or coalesced;
  // they wait in FIFO order behind a small process-wide persistence budget.
  await enqueueJplPersistence(args)
}

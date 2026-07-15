import { advisoryUnlock, tryAdvisoryLock } from '@/src/shared/db/locks'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

import { getEwuraRetryHealth, processReadyEwuraRetries } from './ewuraRetry'
import { shouldUseLocalTanzaniaFiscalization } from './route'

const WORKER_NAME = 'ewuraRetryWorker'
const DEFAULT_POLL_MS = 30_000
const HEARTBEAT_MS = 15_000

let started = false
let stopRequested = false
let loopTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let controller: { stop: () => void } | null = null

async function heartbeat(args: {
  stationId: string
  connected: boolean
  metrics?: Record<string, any>
  lastError?: string | null
}) {
  await upsertProcessHeartbeat({
    stationId: args.stationId,
    processName: WORKER_NAME,
    pid: process.pid,
    status: 'running',
    connected: args.connected,
    metrics: args.metrics ?? {},
    lastError: args.lastError ?? null,
  })
}

async function workerLoop(stationId: string, batchSize: number) {
  if (!(await shouldUseLocalTanzaniaFiscalization(stationId))) {
    await heartbeat({
      stationId,
      connected: true,
      metrics: { route: 'proxy_or_non_tanzania', processed: 0 },
    })
    return
  }

  if (!(await tryAdvisoryLock(`worker:${WORKER_NAME}:${stationId}`))) return

  try {
    const result = await processReadyEwuraRetries({
      stationId,
      limit: batchSize,
    })
    const health = await getEwuraRetryHealth(stationId).catch(() => [])
    await heartbeat({
      stationId,
      connected: true,
      metrics: {
        route: 'local_tz',
        batchSize,
        claimed: result.claimed,
        transactionResults: result.transactions.length,
        reportResults: result.reports.length,
        health,
      },
    })
  } finally {
    await advisoryUnlock(`worker:${WORKER_NAME}:${stationId}`)
  }
}

export function startEwuraRetryWorker(opts?: {
  pollMs?: number
  batchSize?: number
}) {
  if (started && controller) return controller
  started = true
  stopRequested = false

  const stationId = getStationId()
  const pollMs = Math.max(5_000, opts?.pollMs ?? DEFAULT_POLL_MS)
  const batchSize = Math.max(1, opts?.batchSize ?? 10)

  const tick = () => {
    if (stopRequested) return
    workerLoop(stationId, batchSize).catch((e) => {
      logger.error(`[${WORKER_NAME}]`, {
        msg: 'loop error',
        error: e?.stack || e?.message || e,
      })
      heartbeat({
        stationId,
        connected: false,
        metrics: { batchSize, pollMs },
        lastError: String(e?.message || e),
      }).catch(() => {})
    })
  }

  tick()
  loopTimer = setInterval(tick, pollMs)
  heartbeatTimer = setInterval(() => {
    if (stopRequested) return
    heartbeat({
      stationId,
      connected: true,
      metrics: { heartbeat: true, pollMs, batchSize },
    }).catch(() => {})
  }, HEARTBEAT_MS)

  controller = {
    stop: () => {
      stopRequested = true
      started = false
      if (loopTimer) clearInterval(loopTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      loopTimer = null
      heartbeatTimer = null
      controller = null
    },
  }

  return controller
}

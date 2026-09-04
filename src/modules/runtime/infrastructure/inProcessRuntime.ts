import { shouldRunInternalFiscalizationWorkers } from '@/src/platform/config/app-config'
import { getProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { kvSet } from '@/src/shared/storage/stationKv'
import { logger } from '@/src/shared/utils/logger'
import { safeAsync } from '@/src/shared/utils/safeAsync'
import { serializeError } from '@/src/shared/utils/serializeError'

import { startAtgPollingWorker } from '@/src/modules/forecourt/infrastructure/atgPollingWorker'
import { startForecourtConfigSyncWorker } from '@/src/modules/forecourt/infrastructure/configSync/worker'
import { startPosCommandsWorker } from '@/src/modules/pos/infrastructure/posCommandsWorker'
import { startPrintJobsWorker } from '@/src/modules/printing/infrastructure/printJobsWorker'
import { startReportQueueWorker } from '@/src/modules/reports/infrastructure/reportQueueWorker'
import {
  startArchiveBusListener,
  startFiscalBusListener,
  startPosBusListener,
} from '@/src/modules/runtime/infrastructure/busListeners'
// import { startSupervisorMonitorWorker } from '@/src/modules/runtime/infrastructure/supervisorMonitorWorker'
import { startEwuraRetryWorker } from '@/src/modules/tanzania-fiscal/infrastructure/ewuraRetryWorker'
import { startTanzaniaDailyTotalsWorker } from '@/src/modules/tanzania-fiscal/infrastructure/proxyDailyTotalsWorker'
import { publishLatestTanzaniaTankInventories } from '@/src/modules/tanzania-fiscal/infrastructure/proxyTankInventories'
import { startOfflineReceiptPrintWorker } from '@/src/modules/transactions/infrastructure/fiscalization/offlineReceiptPrintWorker'
import { startTransactionFiscalizationSchedulerWorker } from '@/src/modules/transactions/infrastructure/fiscalization/transactionFiscalizationSchedulerWorker'
import { startTransactionQueueWorker } from '@/src/modules/transactions/infrastructure/fiscalization/transactionQueueWorker'

type StopHandle = { stop: () => void } | (() => void) | null | undefined

function toStopFn(h: StopHandle): () => void {
  if (!h) return () => {}
  if (typeof h === 'function') return h
  if (typeof (h as any).stop === 'function') return () => (h as any).stop()
  return () => {}
}

type WorkerSpec = {
  name: string
  start: () => StopHandle
  // Heartbeat freshness threshold in ms before considering it stale.
  staleMs: number
  // Restart backoff base in ms.
  backoffMs: number
}

export function startInProcessRuntime(
  stationId: string,
  opts?: { monitorMs?: number },
) {
  const monitorMs = opts?.monitorMs ?? 10_000
  const configuredTanzaniaDailyTotalsPollMs = Number(
    process.env.VPOS_TANZANIA_DAILY_TOTALS_POLL_MS,
  )
  const tanzaniaDailyTotalsPollMs =
    Number.isFinite(configuredTanzaniaDailyTotalsPollMs) &&
    configuredTanzaniaDailyTotalsPollMs > 0
      ? configuredTanzaniaDailyTotalsPollMs
      : 60_000

  // Ensure migration bus listeners are active before workers start emitting.
  startPosBusListener()
  startFiscalBusListener()
  startArchiveBusListener()

  let stopped = false
  const stopFns = new Map<string, () => void>()
  const restartCounts = new Map<string, number>()
  const nextAllowedRestartAt = new Map<string, number>()
  const workerStartedAt = new Map<string, number>()

  const specs: WorkerSpec[] = [
    {
      name: 'posCommandsWorker',
      start: () => startPosCommandsWorker(),
      staleMs: 20_000,
      backoffMs: 2_000,
    },
    {
      name: 'printJobsWorker',
      start: () => startPrintJobsWorker(),
      staleMs: 25_000,
      backoffMs: 3_000,
    },
    {
      name: 'reportQueueWorker',
      start: () => startReportQueueWorker(),
      staleMs: 25_000,
      backoffMs: 3_000,
    },
    ...(shouldRunInternalFiscalizationWorkers()
      ? [
          {
            name: 'transactionFiscalizationScheduler',
            start: () => startTransactionFiscalizationSchedulerWorker(),
            staleMs: 25_000,
            backoffMs: 3_000,
          },
          {
            name: 'transactionQueueWorker',
            start: () => startTransactionQueueWorker(),
            staleMs: 25_000,
            backoffMs: 3_000,
          },
          {
            name: 'offlineReceiptPrintWorker',
            start: () => startOfflineReceiptPrintWorker(),
            staleMs: 25_000,
            backoffMs: 3_000,
          },
          {
            name: 'ewuraRetryWorker',
            start: () => startEwuraRetryWorker(),
            staleMs: 60_000,
            backoffMs: 5_000,
          },
        ]
      : []),
    {
      name: 'tanzaniaDailyTotalsWorker',
      start: () =>
        startTanzaniaDailyTotalsWorker({
          stationId,
          pollMs: tanzaniaDailyTotalsPollMs,
        }),
      staleMs: Math.max(180_000, tanzaniaDailyTotalsPollMs * 3),
      backoffMs: 10_000,
    },
    {
      name: 'atgPollingWorker',
      start: () =>
        startAtgPollingWorker({
          stationId,
          publishSnapshot: publishLatestTanzaniaTankInventories,
        }),
      staleMs: 60_000,
      backoffMs: 5_000,
    },
    {
      name: 'forecourtConfigSyncWorker',
      start: () => startForecourtConfigSyncWorker(),
      staleMs: 60_000,
      backoffMs: 5_000,
    },
  ]

  function startOne(spec: WorkerSpec) {
    try {
      const h = spec.start()
      workerStartedAt.set(spec.name, Date.now())
      stopFns.set(spec.name, toStopFn(h))
    } catch (e: any) {
      // Record and allow monitor loop to retry.
      logger.error('[inProcessRuntime]', {
        msg: 'worker start failed',
        worker: spec.name,
        error: serializeError(e),
      })
      kvSet(stationId, 'vpos.runtime.lastError', {
        worker: spec.name,
        error: String(e?.message || e),
        at: new Date().toISOString(),
      }).catch(() => {})
      stopFns.set(spec.name, () => {})
    }
  }

  function stopOne(name: string) {
    const fn = stopFns.get(name)
    try {
      fn?.()
    } catch {}
    stopFns.delete(name)
    workerStartedAt.delete(name)
  }

  // Start all workers immediately
  for (const s of specs) startOne(s)

  async function monitorTick() {
    if (stopped) return
    const now = Date.now()

    for (const spec of specs) {
      // Simple "staleness" check via heartbeats
      const hb = await safeAsync(
        getProcessHeartbeat(stationId, spec.name),
        `inProcessRuntime.heartbeat.${spec.name}`,
      )
      if (!hb) continue

      const startedAt = workerStartedAt.get(spec.name) ?? now
      const startupGraceMs = Math.min(30_000, spec.staleMs)
      if (now - startedAt < startupGraceMs) continue

      const last = hb.lastHeartbeatAt
        ? new Date(hb.lastHeartbeatAt).getTime()
        : 0
      const stale = last && now - last > spec.staleMs

      // A heartbeat row from the previous process must not trigger an immediate
      // restart of the freshly-started worker before its first heartbeat write.
      if (hb.pid != null && Number(hb.pid) !== process.pid && !stale) continue
      if (!stale) continue

      const allowAt = nextAllowedRestartAt.get(spec.name) ?? 0
      if (now < allowAt) continue

      // Restart
      stopOne(spec.name)

      const count = (restartCounts.get(spec.name) ?? 0) + 1
      restartCounts.set(spec.name, count)

      const backoff = Math.min(
        60_000,
        spec.backoffMs * Math.pow(2, Math.max(0, count - 1)),
      )
      nextAllowedRestartAt.set(spec.name, now + backoff)

      await safeAsync(
        kvSet(stationId, 'vpos.runtime.lastError', {
          worker: spec.name,
          error: `Heartbeat stale; restarting (count=${count}, backoffMs=${backoff})`,
          at: new Date().toISOString(),
        }),
        `inProcessRuntime.staleRestart.${spec.name}`,
      )

      startOne(spec)
    }
  }

  const monitorTimer = setInterval(() => {
    safeAsync(monitorTick(), 'inProcessRuntime.monitorTick')
  }, monitorMs)

  return {
    stop: () => {
      stopped = true
      clearInterval(monitorTimer)
      for (const name of Array.from(stopFns.keys())) stopOne(name)
    },
  }
}

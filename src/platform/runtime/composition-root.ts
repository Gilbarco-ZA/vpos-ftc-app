import {
  shouldRunInternalFiscalizationWorkers,
  shouldRunProxyWorker,
} from '@/src/platform/config/app-config'
import { logger } from '@/src/shared/utils/logger'

import {
  bootstrapRuntimeEnvironment,
  parseRuntimeInterval,
  requireRuntimeStationId,
} from './env'
import {
  RuntimeWorkerStopHandle,
  startEwuraRetryRuntimeWorker,
  startForecourtConfigSyncRuntimeWorker,
  startInProcessRuntimeServices,
  startPosCommandsRuntimeWorker,
  startProxyFiscalSenderRuntimeWorker,
  startPssXmlSyncRuntimeWorker,
  startReceiptPrintRuntimeWorker,
  startReportQueueRuntimeWorker,
  startSupervisorMonitorRuntimeWorker,
  startTransactionFiscalizationRuntimeWorker,
  startTransactionFiscalizationSchedulerRuntimeWorker,
} from './worker-services'

function toStopFn(handle: RuntimeWorkerStopHandle): () => Promise<void> {
  if (!handle) return async () => {}
  if (typeof handle === 'function') {
    return async () => {
      await handle()
    }
  }
  if (
    typeof handle === 'object' &&
    handle &&
    typeof handle.stop === 'function'
  ) {
    return async () => {
      await handle.stop()
    }
  }
  return async () => {}
}

/**
 * Canonical runtime composition root.
 *
 * Owns startup composition for:
 * - the dedicated omnibus worker process (`scripts/worker.ts`)
 * - the local single-process server runtime (`server.ts`)
 * - shared worker environment boot helpers used by `workers/*`
 *
 * Important runtime composition:
 * - Dedicated worker process starts supervisor monitoring, proxy sending,
 *   forecourt config sync, POS command polling, transaction scheduling,
 *   transaction fiscalization execution, and optional PSS XML watching.
 * - Single-process server runtime starts the in-process worker set and
 *   conditionally starts proxy sending after bootstrap completes.
 * - Print and report workers still exist as standalone entrypoints, but remain
 *   disabled in the omnibus worker script to preserve prior startup behaviour.
 */
export function startDedicatedWorkerProcess() {
  bootstrapRuntimeEnvironment()

  const pollMs = parseRuntimeInterval(process.env.VPOS_WORKER_POLL_MS, 1000)
  const txPollMs = parseRuntimeInterval(
    process.env.VPOS_TX_WORKER_POLL_MS,
    pollMs,
  )
  const printPollMs = parseRuntimeInterval(
    process.env.VPOS_PRINT_WORKER_POLL_MS,
    pollMs,
  )
  const reportPollMs = parseRuntimeInterval(
    process.env.VPOS_REPORT_WORKER_POLL_MS,
    pollMs,
  )
  const proxyPollMs = parseRuntimeInterval(
    process.env.VPOS_PROXY_SENDER_POLL_MS,
    pollMs,
  )
  const forecourtSyncPollMs = parseRuntimeInterval(
    process.env.FORECOURT_SYNC_POLL_MS,
    10 * 60_000,
  )
  const ewuraRetryPollMs = parseRuntimeInterval(
    process.env.VPOS_EWURA_RETRY_POLL_MS,
    30_000,
  )

  const stationId = requireRuntimeStationId('worker')

  logger.info('[worker]', {
    msg: `starting. pid=${process.pid} stationId=${stationId}`,
  })

  const stopFns: Array<() => Promise<void>> = []
  stopFns.push(toStopFn(startPosCommandsRuntimeWorker({ pollMs })))
  stopFns.push(
    toStopFn(
      startForecourtConfigSyncRuntimeWorker({ pollMs: forecourtSyncPollMs }),
    ),
  )
  if (shouldRunInternalFiscalizationWorkers()) {
    stopFns.push(
      toStopFn(
        startTransactionFiscalizationSchedulerRuntimeWorker({
          pollMs: txPollMs,
        }),
      ),
    )
    stopFns.push(
      toStopFn(
        startTransactionFiscalizationRuntimeWorker({ pollMs: txPollMs }),
      ),
    )
    stopFns.push(
      toStopFn(startEwuraRetryRuntimeWorker({ pollMs: ewuraRetryPollMs })),
    )
  }

  // Preserved intentionally: print/report workers remain standalone entrypoints
  // and are not started inside the omnibus worker script today.
  void printPollMs
  void reportPollMs
  void startReceiptPrintRuntimeWorker
  void startReportQueueRuntimeWorker

  stopFns.push(
    toStopFn(
      startProxyFiscalSenderRuntimeWorker({ stationId, pollMs: proxyPollMs }),
    ),
  )
  stopFns.push(toStopFn(startSupervisorMonitorRuntimeWorker(stationId)))
  stopFns.push(toStopFn(startPssXmlSyncRuntimeWorker({ stationId, pollMs })))

  const shutdown = async (signal: string) => {
    logger.info('[worker]', { msg: `received ${signal}. exiting...` })
    for (const stop of stopFns.reverse()) {
      try {
        await stop()
      } catch {}
    }
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  return {
    stop: async () => {
      await shutdown('stop')
    },
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __proxyFiscalSenderWorkerStarted: boolean | undefined
  // eslint-disable-next-line no-var
  var __supervisorMonitorWorkerStarted: boolean | undefined
  // eslint-disable-next-line no-var
  var __pssXmlSyncWorkerStarted: boolean | undefined
}

export function startLocalServerRuntime(stationId: string) {
  bootstrapRuntimeEnvironment()

  const stopFns: Array<() => Promise<void>> = []

  if (shouldRunProxyWorker() && !globalThis.__proxyFiscalSenderWorkerStarted) {
    globalThis.__proxyFiscalSenderWorkerStarted = true
    const proxyPollMs = parseRuntimeInterval(
      process.env.VPOS_PROXY_SENDER_POLL_MS,
      1000,
    )
    stopFns.push(
      toStopFn(
        startProxyFiscalSenderRuntimeWorker({ stationId, pollMs: proxyPollMs }),
      ),
    )
  }

  if (!globalThis.__supervisorMonitorWorkerStarted) {
    globalThis.__supervisorMonitorWorkerStarted = true
    stopFns.push(toStopFn(startSupervisorMonitorRuntimeWorker(stationId)))
  }

  if (!globalThis.__pssXmlSyncWorkerStarted) {
    globalThis.__pssXmlSyncWorkerStarted = true
    stopFns.push(toStopFn(startPssXmlSyncRuntimeWorker({ stationId })))
  }

  stopFns.push(toStopFn(startInProcessRuntimeServices(stationId)))

  return {
    stop: async () => {
      for (const stop of stopFns.reverse()) {
        try {
          await stop()
        } catch {}
      }

      globalThis.__proxyFiscalSenderWorkerStarted = false
      globalThis.__supervisorMonitorWorkerStarted = false
      globalThis.__pssXmlSyncWorkerStarted = false
    },
  }
}

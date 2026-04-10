import type { RuntimeWorkerStopHandle } from '@/src/platform/runtime'
import { runWorkerEntrypoint } from '@/workers/shared/worker-runner'

import { shouldRunProxyWorker } from '@/src/platform/config/app-config'
import { startProxyFiscalSenderRuntimeWorker } from '@/src/platform/runtime'
import { getStationId } from '@/src/shared/utils/getStationId'
import { isUuid } from '@/src/shared/utils/ids'
import { logger } from '@/src/shared/utils/logger'

const DEFAULT_POLL_MS = 1000

declare global {
  var __proxyFiscalSenderWorkerStarted: boolean | undefined
}

/**
 * Thin worker entrypoint.
 *
 * Canonical worker process entrypoint for proxy fiscal sending.
 */
export function startProxySenderWorker(opts: {
  stationId: string
  pollMs?: number
}) {
  const handle: RuntimeWorkerStopHandle = startProxyFiscalSenderRuntimeWorker({
    stationId: opts.stationId,
    pollMs: opts.pollMs ?? DEFAULT_POLL_MS,
  })

  return {
    stop: async () => {
      if (typeof handle === 'function') {
        await handle()
        return
      }
      // if (
      //   handle &&
      //   typeof handle === 'object' &&
      //   typeof handle.stop === 'function'
      // ) {
      //   await handle.stop()
      // }
    },
  }
}

export function startProxySenderWorkerBoot(stationIdOverride?: string) {
  if (!shouldRunProxyWorker() || globalThis.__proxyFiscalSenderWorkerStarted)
    return

  globalThis.__proxyFiscalSenderWorkerStarted = true
  const stationId = stationIdOverride || getStationId()

  if (!isUuid(stationId)) {
    logger.error('[proxy-sender.worker]', {
      msg: `VPOS_STATION_ID must be a UUID. Got '${stationId || 'empty'}'.`,
    })
    return
  }

  const pollMs = Number(
    process.env.VPOS_PROXY_SENDER_POLL_MS || DEFAULT_POLL_MS,
  )
  startProxySenderWorker({ stationId, pollMs })
}

export async function runProxySenderWorker() {
  return await runWorkerEntrypoint({
    workerName: 'proxy-sender.worker',
    pollEnvNames: ['VPOS_PROXY_SENDER_POLL_MS', 'VPOS_WORKER_POLL_MS'],
    defaultPollMs: DEFAULT_POLL_MS,
    start: async ({ stationId, pollMs }) =>
      startProxySenderWorker({ stationId, pollMs }),
  })
}

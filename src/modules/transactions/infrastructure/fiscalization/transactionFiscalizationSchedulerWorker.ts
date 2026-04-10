import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { claimTransactionsForFiscalizationQueue } from '@/src/modules/transactions/application/commands/claim-transactions-for-fiscalization-queue'
import { getStationLinkingWindowSeconds } from '@/src/modules/transactions/infrastructure/linkingWindow'
import { transactionQueueRepo } from '@/src/modules/transactions/infrastructure/transactionQueueRepo'

const WORKER_NAME = 'transactionFiscalizationScheduler'
const DEFAULT_POLL_MS = 750

async function claimEligibleTransactions(opts: {
  stationId: string
  limit: number
  linkingWindowSeconds: number | null
}) {
  return await claimTransactionsForFiscalizationQueue(opts)
}

async function enqueueQueueRows(stationId: string, ids: string[]) {
  for (const id of ids) {
    await transactionQueueRepo.enqueueForTransaction(stationId, uuidv4(), id, {
      transactionId: id,
    })
  }
}

export function startTransactionFiscalizationSchedulerWorker(opts?: {
  pollMs?: number
  batchSize?: number
}) {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS
  const batchSize = opts?.batchSize ?? 10
  const stationId = getStationId()

  let stopped = false
  let tickInFlight = false

  async function tick() {
    if (stopped || tickInFlight) return
    tickInFlight = true
    try {
      const linkingWindowSeconds =
        await getStationLinkingWindowSeconds(stationId)

      const claimed = await claimEligibleTransactions({
        stationId,
        limit: batchSize,
        linkingWindowSeconds,
      })

      if (claimed.length) {
        await enqueueQueueRows(
          stationId,
          claimed.map((c) => c.id),
        )
      }

      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: {
          pollMs,
          batchSize,
          linkingWindowSeconds: linkingWindowSeconds ?? null,
          lastClaimed: claimed.length,
        },
        lastError: null,
      })
    } catch (e: any) {
      logger.error(`[${WORKER_NAME}]`, {
        msg: 'tick failed',
        error: e?.stack || e?.message || e,
      })
      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: false,
        metrics: { pollMs, batchSize },
        lastError: String(e?.message || e),
      }).catch(() => {})
    } finally {
      tickInFlight = false
    }
  }

  const timer = setInterval(() => tick().catch(() => {}), pollMs)
  tick().catch(() => {})

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

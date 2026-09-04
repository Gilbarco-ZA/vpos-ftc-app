import { queryAll } from '@/src/platform/db/postgres'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

import { enqueueAutoPrintFiscalReceipt } from './autoPrintFiscalReceipt'
import { isOfflineProxySubmission } from './proxyOfflineSubmission'

const WORKER_NAME = 'offlineReceiptPrintWorker'
const DEFAULT_POLL_MS = 2_000

async function loadCandidates(stationId: string, limit: number) {
  return await queryAll<{
    transaction_id: string
    response_payload: unknown
  }>(
    `SELECT t.id::text AS transaction_id,
            fe.response_payload
       FROM transactions t
       JOIN fuel_stations fs ON fs.id = t.station_id
       JOIN LATERAL (
         SELECT event.response_payload
           FROM fiscalization_events event
          WHERE event.station_id = t.station_id
            AND event.transaction_id = t.id
            AND event.transport = 'proxy'
            AND event.status = 'PENDING'
          ORDER BY event.occurred_at DESC, event.created_at DESC
          LIMIT 1
       ) fe ON TRUE
      WHERE t.station_id = $1
        AND t.deleted_at IS NULL
        AND t.status = 'FISCALIZING'
        AND UPPER(BTRIM(COALESCE(fs.country, ''))) IN ('TZ', 'TZA', 'TANZANIA')
        AND NOT EXISTS (
          SELECT 1
            FROM print_jobs pj
           WHERE pj.station_id = t.station_id
             AND pj.idempotency_key = 'receipt:' || t.id::text || ':offline'
        )
      ORDER BY t.updated_at ASC
      LIMIT $2`,
    [stationId, limit],
  )
}

export function startOfflineReceiptPrintWorker(opts?: {
  pollMs?: number
  batchSize?: number
}) {
  const stationId = getStationId()
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS
  const batchSize = Math.max(1, opts?.batchSize ?? 20)
  let stopped = false
  let tickInFlight = false

  async function tick() {
    if (stopped || tickInFlight) return
    tickInFlight = true
    let matched = 0
    let enqueued = 0

    try {
      const candidates = await loadCandidates(stationId, batchSize)
      for (const candidate of candidates) {
        if (!isOfflineProxySubmission(candidate.response_payload)) continue
        matched += 1

        const result = await enqueueAutoPrintFiscalReceipt({
          stationId,
          transactionId: candidate.transaction_id,
          offlinePrint: true,
        })
        if (result.enqueued) enqueued += 1
      }

      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: { pollMs, batchSize, matched, enqueued },
        lastError: null,
      })
    } catch (error: any) {
      logger.error(`[${WORKER_NAME}]`, {
        msg: 'tick failed',
        error: String(error?.stack || error?.message || error),
      })
      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: false,
        metrics: { pollMs, batchSize, matched, enqueued },
        lastError: String(error?.message || error),
      }).catch(() => {})
    } finally {
      tickInFlight = false
    }
  }

  const timer = setInterval(() => tick().catch(() => {}), pollMs)
  timer.unref?.()
  tick().catch(() => {})

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

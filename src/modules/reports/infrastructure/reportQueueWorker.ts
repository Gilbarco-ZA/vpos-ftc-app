import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { calculateExponentialBackoffSeconds } from '@/src/platform/queue/retry-policy'
import { advisoryUnlock, tryAdvisoryLock } from '@/src/shared/db/locks'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { runReport } from '@/src/modules/reports/infrastructure/runReport'

const WORKER_NAME = 'reportQueueWorker'
const DEFAULT_POLL_MS = 1000
const HEARTBEAT_MS = 5_000

let started = false

type QueueRow = {
  id: string
  station_id: string
  payload: any
  retry_count: number
}

async function claimNextBatch(limit = 5): Promise<QueueRow[]> {
  return await queryAll<QueueRow>(
    `WITH claimed AS (
			SELECT id
			  FROM report_queue
			 WHERE status = 'PENDING'
			   AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
			 ORDER BY created_at ASC
			 FOR UPDATE SKIP LOCKED
			 LIMIT $1
		)
		UPDATE report_queue rq
		   SET status = 'PROCESSING',
		       processing_started_at = NOW(),
		       updated_at = NOW()
		  FROM claimed
		 WHERE rq.id = claimed.id
		RETURNING rq.id, rq.station_id, rq.payload, rq.retry_count`,
    [limit],
  )
}

async function markDone(id: string) {
  await query(
    `UPDATE report_queue
		   SET status = 'DONE',
		       last_error = NULL,
		       next_attempt_at = NULL,
		       updated_at = NOW()
		 WHERE id = $1`,
    [id],
  )
}

async function markFailed(opts: {
  id: string
  retryCount: number
  maxRetries: number
  errorMessage: string
}) {
  const { id, retryCount, maxRetries, errorMessage } = opts
  const nextRetry = retryCount + 1
  if (nextRetry >= maxRetries) {
    await query(
      `UPDATE report_queue
			   SET status = 'FAILED',
			       retry_count = $2,
			       last_error = $3,
			       next_attempt_at = NULL,
			       updated_at = NOW()
			 WHERE id = $1`,
      [id, nextRetry, errorMessage],
    )
    return
  }

  const delaySeconds = calculateExponentialBackoffSeconds(nextRetry)
  await query(
    `UPDATE report_queue
		   SET status = 'PENDING',
		       retry_count = $2,
		       last_error = $3,
		       next_attempt_at = NOW() + ($4 || ' seconds')::interval,
		       updated_at = NOW()
		 WHERE id = $1`,
    [id, nextRetry, errorMessage, String(delaySeconds)],
  )
}

async function upsertReportFromResult(opts: {
  stationId: string
  sourceQueueId: string
  reportType: string
  reportDateTimeIso: string
  payload: any
  reference?: string | null
}) {
  const {
    stationId,
    sourceQueueId,
    reportType,
    reportDateTimeIso,
    payload,
    reference,
  } = opts

  // If already exists (idempotency), no-op
  const existing = await queryOne<any>(
    `SELECT id FROM reports WHERE station_id = $1 AND source_queue_id = $2`,
    [stationId, sourceQueueId],
  )
  if (existing?.id) return

  await query(
    `INSERT INTO reports (id, station_id, report_date_time, report_type, payload, source_queue_id)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      stationId,
      reportDateTimeIso,
      reportType,
      { ...payload, reference: reference ?? null },
      sourceQueueId,
    ],
  )
}

export function startReportQueueWorker(opts?: {
  pollMs?: number
  maxRetries?: number
}) {
  if (started) return
  started = true

  const pollMs = Number(
    opts?.pollMs ??
      process.env.VPOS_REPORT_WORKER_POLL_MS ??
      process.env.VPOS_WORKER_POLL_MS ??
      DEFAULT_POLL_MS,
  )
  const maxRetries = Number(
    opts?.maxRetries ?? process.env.VPOS_REPORT_MAX_RETRIES ?? 5,
  )

  let lastHeartbeat = 0
  let stop = false

  ;(async () => {
    const gotLock = await tryAdvisoryLock(`worker:${WORKER_NAME}`)
    if (!gotLock) {
      // another instance is running
      return
    }

    try {
      while (!stop) {
        const now = Date.now()
        if (now - lastHeartbeat > HEARTBEAT_MS) {
          await upsertProcessHeartbeat({
            stationId: getStationId(),
            processName: WORKER_NAME,
            metrics: { pollMs },
          })
          lastHeartbeat = now
        }

        const batch = await claimNextBatch(5)
        if (!batch.length) {
          await new Promise((r) => setTimeout(r, pollMs))
          continue
        }

        for (const item of batch) {
          try {
            const reportType =
              item.payload?.report_type ??
              item.payload?.reportType ??
              item.payload?.type ??
              null

            const result = await runReport({
              stationId: item.station_id,
              payload: item.payload,
              reportType,
              sourceQueueId: item.id,
            })

            if (!result.ok) {
              await markFailed({
                id: item.id,
                retryCount: item.retry_count ?? 0,
                maxRetries,
                errorMessage: result.error,
              })
              continue
            }

            await upsertReportFromResult({
              stationId: item.station_id,
              sourceQueueId: item.id,
              reportType: result.reportType,
              reportDateTimeIso: result.reportDateTime,
              payload: result.payload,
              reference: result.reference ?? null,
            })

            await markDone(item.id)
          } catch (e: any) {
            await markFailed({
              id: item.id,
              retryCount: item.retry_count ?? 0,
              maxRetries,
              errorMessage: String(e?.message || e),
            })
          }
        }
      }
    } finally {
      await advisoryUnlock(`worker:${WORKER_NAME}`)
    }
  })()

  return {
    stop: () => {
      stop = true
    },
  }
}

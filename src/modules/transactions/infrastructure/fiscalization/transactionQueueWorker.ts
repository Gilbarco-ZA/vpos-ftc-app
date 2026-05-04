import type { TransactionQueueRow } from '@/src/modules/transactions/infrastructure/transactionQueueRepo'

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { calculateExponentialBackoffSeconds } from '@/src/platform/queue/retry-policy'
import { advisoryUnlock, tryAdvisoryLock } from '@/src/shared/db/locks'
import { toNumberOr } from '@/src/shared/numbers'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import {
  enqueueFiscalInboxMessage,
  enqueueFiscalInboxReviewFailure,
} from '@/src/shared/runtime/fiscalInbox'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { customersRepo } from '@/src/modules/customers/infrastructure/customersRepo'
import { fuelStationsRepo } from '@/src/modules/forecourt/infrastructure/repositories/fuelStationsRepo'
import { completeTransactionFiscalization } from '@/src/modules/transactions/application/commands/complete-transaction-fiscalization'
import { failTransactionFiscalization } from '@/src/modules/transactions/application/commands/fail-transaction-fiscalization'
import { markTransactionFiscalizing } from '@/src/modules/transactions/application/commands/mark-transaction-fiscalizing'
import { runFiscalization } from '@/src/modules/transactions/infrastructure/fiscalization/runFiscalization'
import { getStationLinkingWindowSeconds } from '@/src/modules/transactions/infrastructure/linkingWindow'
import { transactionQueueRepo } from '@/src/modules/transactions/infrastructure/transactionQueueRepo'

const WORKER_NAME = 'transactionQueueWorker'
const DEFAULT_POLL_MS = 750
const HEARTBEAT_MS = 5_000

let started = false
let stopRequested = false
let loopTimer: NodeJS.Timeout | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let controller: { stop: () => void } | null = null

async function claimNextBatch(limit = 5): Promise<TransactionQueueRow[]> {
  return await transactionQueueRepo.claimNextBatch(limit)
}

async function markDone(id: string, stationId?: string, meta?: any) {
  await transactionQueueRepo.markDone(id)

  getRuntimeBus().publish('fiscal', {
    type: 'transactionQueueDone',
    stationId: stationId ?? getStationId(),
    queueId: id,
    at: Date.now(),
    meta: meta ?? null,
  })
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
    getRuntimeBus().publish('fiscal', {
      type: 'transactionQueueFailed',
      stationId: getStationId(),
      queueId: id,
      final: true,
      error: errorMessage,
      at: Date.now(),
    })

    await transactionQueueRepo.markFailedTerminal(id, nextRetry, errorMessage)
    return
  }

  const delaySeconds = calculateExponentialBackoffSeconds(nextRetry)
  getRuntimeBus().publish('fiscal', {
    type: 'transactionQueueFailed',
    stationId: getStationId(),
    queueId: id,
    final: false,
    error: errorMessage,
    nextRetryAtSeconds: delaySeconds,
    at: Date.now(),
  })

  await transactionQueueRepo.requeuePendingWithDelay(
    id,
    nextRetry,
    errorMessage,
    delaySeconds,
  )
}

async function ensureCustomer(
  stationId: string,
  payload: any,
): Promise<string | null> {
  const customer = payload?.customer
  const customerId =
    payload?.customer_id ||
    payload?.customerId ||
    customer?.id ||
    customer?.customer_id
  if (customerId && /^[0-9a-fA-F-]{36}$/.test(String(customerId))) {
    return String(customerId)
  }

  const tin = (customer?.tin || payload?.tin || '').toString().trim()
  const buyerName = (customer?.buyer_name || customer?.buyerName || '')
    .toString()
    .trim()
  if (!tin) return null

  const country = (await fuelStationsRepo.getCountryById(stationId)) || 'TZ'
  const existingId = await customersRepo.findActiveIdByCountryTin(country, tin)
  if (existingId) return existingId
  if (!buyerName) return null

  return await customersRepo.createNamedCustomer({
    stationId,
    country,
    tin,
    buyerName,
  })
}

async function ensureTransactionFromQueue(
  row: TransactionQueueRow,
): Promise<any> {
  const stationId = row.station_id
  const payload = row.payload ?? {}

  // If a transaction already exists (scheduler enqueued by transactionId), load it directly.
  const existingById = payload?.transactionId
    ? await transactionQueueRepo.findTransactionByTransactionId(
        String(payload.transactionId),
        stationId,
      )
    : null
  if (existingById) return existingById

  const existing = await transactionQueueRepo.findTransactionByQueueId(
    stationId,
    row.id,
  )
  if (existing) return existing

  const customerId = await ensureCustomer(stationId, payload)
  const pump = Math.trunc(
    toNumberOr(payload.pump_number ?? payload.pumpNumber ?? 0, 0),
  )
  const txnDt = payload.transaction_date_time
    ? new Date(payload.transaction_date_time)
    : payload.date && payload.time
      ? new Date(`${payload.date}T${payload.time}Z`)
      : new Date()

  const total = toNumberOr(
    payload.total_amount ?? payload.totalAmount ?? payload.amount ?? 0,
    0,
  )
  const volume = payload.volume != null ? toNumberOr(payload.volume, 0) : null
  const fuelType = payload.fuel_type ?? payload.fuelType ?? null
  const rawPosRef =
    payload.pos_reference ?? payload.posReference ?? payload.reference ?? null
  const posRef =
    rawPosRef == null ? null : String(rawPosRef).trim().toUpperCase() || null

  const status = customerId ? 'ALLOCATED' : 'OPEN'

  const linkingWindowSeconds = await getStationLinkingWindowSeconds(stationId)

  const inserted = await queryOne<any>(
    `INSERT INTO transactions (
			id,
			station_id, customer_id, pump_number, transaction_date_time, total_amount,
			volume, fuel_type, pos_reference, status, source_queue_id, linking_window_expires_at
		)
		VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      CASE
        WHEN $12::int IS NULL THEN NULL
        ELSE NOW() + ($12::int * INTERVAL '1 second')
      END
    )
		RETURNING *`,
    [
      uuidv4(),
      stationId,
      customerId,
      pump,
      txnDt.toISOString(),
      total,
      volume,
      fuelType,
      posRef,
      status,
      row.id,
      linkingWindowSeconds,
    ],
  )
  return inserted
}

async function processOne(row: TransactionQueueRow) {
  const maxRetries = Number(process.env.VPOS_TX_MAX_RETRIES ?? '5')
  let txnForReview: any = null
  try {
    if (!row.payload || typeof row.payload !== 'object') {
      throw new Error('Invalid transaction payload (expected object)')
    }

    // Idempotency anchor: transactions.source_queue_id is unique.
    const txn = await ensureTransactionFromQueue(row)
    txnForReview = txn

    // If already fiscalized, only ensure a receipt print job exists (best-effort) and finish.
    if (txn?.status === 'FISCALIZED' && txn?.fiscalization_reference) {
      await markDone(row.id, row.station_id, {
        transactionId: row.payload?.transactionId ?? null,
      })
      await upsertProcessHeartbeat({
        stationId: row.station_id,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: { lastQueueId: row.id, alreadyFiscalized: true },
        lastError: null,
      })
      return
    }

    const customer = txn?.customer_id
      ? await customersRepo.findById(txn.customer_id)
      : null

    // Move transaction to FISCALIZING through the transaction status service.
    const fiscalizing = await markTransactionFiscalizing({
      stationId: row.station_id,
      transactionId: txn.id,
    })
    if (!fiscalizing) {
      throw new Error('Transaction could not be moved to FISCALIZING')
    }

    const fiscalResult = await runFiscalization({
      stationId: row.station_id,
      transaction: txn,
      customer,
    })

    if (fiscalResult.status === 'SUCCESS') {
      await completeTransactionFiscalization({
        stationId: row.station_id,
        transactionId: txn.id,
        fiscalResult: fiscalResult as typeof fiscalResult & {
          status: 'SUCCESS'
        },
      })
    } else {
      await failTransactionFiscalization({
        stationId: row.station_id,
        transactionId: txn.id,
        fiscalResult: fiscalResult as typeof fiscalResult & {
          status: 'FAILED'
        },
      })
    }

    if (fiscalResult.status === 'SUCCESS') {
      await enqueueFiscalInboxMessage({
        stationId: row.station_id,
        topic: 'fiscal',
        requestId: `txn-fiscalized:${txn.id}`,
        message: {
          type: 'transactionFiscalized',
          stationId: row.station_id,
          transactionId: txn.id,
          reference: fiscalResult.reference ?? null,
          at: Date.now(),
        },
      }).catch((err) => {
        logger.error('[vpos-transactions]', {
          msg: 'Failed to enqueue fiscalized notification',
          error: err,
        })
      })
    } else {
      await enqueueFiscalInboxMessage({
        stationId: row.station_id,
        topic: 'fiscal',
        requestId: `txn-failed:${txn.id}`,
        message: {
          type: 'transactionFailed',
          stationId: row.station_id,
          transactionId: txn.id,
          error: fiscalResult.errorMessage || 'Fiscalization failed',
          at: Date.now(),
        },
      }).catch((err) => {
        logger.error('[vpos-transactions]', {
          msg: 'Failed to enqueue failure notification',
          error: err,
        })
      })
    }

    if (fiscalResult.status !== 'SUCCESS') {
      throw new Error(fiscalResult.errorMessage ?? 'Fiscalization failed')
    }

    await markDone(row.id, row.station_id, {
      transactionId: row.payload?.transactionId ?? null,
    })
    await upsertProcessHeartbeat({
      stationId: row.station_id,
      processName: WORKER_NAME,
      pid: process.pid,
      status: 'running',
      connected: true,
      metrics: { lastQueueId: row.id, lastOkAt: new Date().toISOString() },
      lastError: null,
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    await enqueueFiscalInboxReviewFailure({
      stationId: row.station_id,
      topic: 'external_fiscalization',
      requestId: txnForReview?.id
        ? `txn-fiscalization-review:${txnForReview.id}`
        : `queue-fiscalization-review:${row.id}`,
      error: e,
      message: {
        type: 'transactionFiscalizationReviewRequired',
        stationId: row.station_id,
        transactionId: txnForReview?.id ?? null,
        queueId: row.id,
        payload: row.payload ?? null,
        error: msg,
        at: Date.now(),
      },
    }).catch((err) => {
      logger.error('[vpos-transactions]', {
        msg: 'Failed to enqueue fiscal inbox review item',
        error: err,
        queueId: row.id,
      })
    })
    await markFailed({
      id: row.id,
      retryCount: row.retry_count ?? 0,
      maxRetries,
      errorMessage: msg,
    })
    await upsertProcessHeartbeat({
      stationId: row.station_id,
      processName: WORKER_NAME,
      pid: process.pid,
      status: 'running',
      connected: true,
      metrics: { lastQueueId: row.id, lastFailAt: new Date().toISOString() },
      lastError: msg,
    })
  }
}

async function heartbeatAllStations() {
  const stations = await queryAll<{ station_id: string }>(
    `SELECT DISTINCT station_id FROM process_heartbeats WHERE process_name = $1`,
    [WORKER_NAME],
  )
  await Promise.all(
    stations.map((s) =>
      upsertProcessHeartbeat({
        stationId: s.station_id,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: { heartbeat: true },
        lastError: null,
      }),
    ),
  )
}

async function workerLoop() {
  if (!(await tryAdvisoryLock(`worker:${WORKER_NAME}`))) return
  try {
    const claimed = await claimNextBatch(5)
    for (const row of claimed) {
      await processOne(row)
    }
  } finally {
    await advisoryUnlock(`worker:${WORKER_NAME}`)
  }
}

export function startTransactionQueueWorker(opts?: { pollMs?: number }) {
  // Idempotent: return existing controller if already started
  if (started && controller) return controller
  started = true
  stopRequested = false

  const pollMs = Math.max(200, opts?.pollMs ?? DEFAULT_POLL_MS)

  // kick immediately
  workerLoop().catch((e) =>
    logger.error(`[${WORKER_NAME}]`, { msg: 'loop error', error: e }),
  )
  heartbeatAllStations().catch((e) =>
    logger.error(`[${WORKER_NAME}]`, { msg: 'heartbeat error', error: e }),
  )

  loopTimer = setInterval(() => {
    if (stopRequested) return
    workerLoop().catch((e) =>
      logger.error(`[${WORKER_NAME}]`, { msg: 'loop error', error: e }),
    )
  }, pollMs)

  heartbeatTimer = setInterval(() => {
    if (stopRequested) return
    heartbeatAllStations().catch((e) =>
      logger.error(`[${WORKER_NAME}]`, { msg: 'heartbeat error', error: e }),
    )
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

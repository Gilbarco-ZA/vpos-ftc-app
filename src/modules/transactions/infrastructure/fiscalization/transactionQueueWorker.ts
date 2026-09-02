import type { TransactionQueueRow } from '@/src/modules/transactions/infrastructure/transactionQueueRepo'

import {
  getPostgresPoolDiagnostics,
  queryAll,
  queryOne,
} from '@/src/platform/db/postgres'
import { calculateExponentialBackoffSeconds } from '@/src/platform/queue/retry-policy'
import { advisoryUnlock, tryAdvisoryLock } from '@/src/shared/db/locks'
import { toNumberOr } from '@/src/shared/numbers'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { listSetupCountryOptions } from '@/src/shared/server/config/countryDatasets'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { customersRepo } from '@/src/modules/customers/infrastructure/customersRepo'
import {
  enqueueFiscalInboxMessage,
  enqueueFiscalInboxReviewFailure,
} from '@/src/modules/fiscal-inbox/application/fiscalInbox'
import { fuelStationsRepo } from '@/src/modules/forecourt/infrastructure/repositories/fuelStationsRepo'
import { completeTransactionFiscalization } from '@/src/modules/transactions/application/commands/complete-transaction-fiscalization'
import { failTransactionFiscalization } from '@/src/modules/transactions/application/commands/fail-transaction-fiscalization'
import { markTransactionFiscalizing } from '@/src/modules/transactions/application/commands/mark-transaction-fiscalizing'
import { runCreditNoteFiscalization } from '@/src/modules/transactions/infrastructure/fiscalization/runCreditNoteFiscalization'
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
let loopInFlight = false
let heartbeatInFlight = false

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

function parseQueuePayload(payload: any) {
  return typeof payload === 'string' ? JSON.parse(payload) : payload
}

function isCreditNotePayload(payload: any) {
  return String(payload?.kind ?? '').toUpperCase() === 'CREDIT_NOTE'
}

async function loadCreditNoteForQueueItem(args: {
  stationId: string
  creditNoteId: string
  transactionId: string
}) {
  return await queryOne<any>(
    `SELECT *
       FROM credit_notes
      WHERE station_id = $1
        AND id = $2::uuid
        AND transaction_id = $3::uuid
      LIMIT 1`,
    [args.stationId, args.creditNoteId, args.transactionId],
  )
}

async function updateLocalCreditNoteStatus(args: {
  stationId: string
  creditNoteId: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  response?: unknown
  lastError?: string | null
}) {
  await queryOne(
    `UPDATE credit_notes
        SET status = $3,
            proxy_response = CASE
              WHEN $4::jsonb IS NULL THEN proxy_response
              ELSE COALESCE(proxy_response, '{}'::jsonb) || $4::jsonb
            END,
            last_error = $5,
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2::uuid`,
    [
      args.stationId,
      args.creditNoteId,
      args.status,
      args.response == null ? null : JSON.stringify(args.response),
      args.lastError ?? null,
    ],
  )
}

async function resolveDefaultCountryCode() {
  const envCountry = String(process.env.COUNTRY_CODE || '')
    .trim()
    .toUpperCase()
  const countries = await listSetupCountryOptions()
  return (
    countries.find(
      (item) => item.value === envCountry || item.countryCode === envCountry,
    )?.value ||
    countries[0]?.value ||
    envCountry ||
    'UN'
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

  const country =
    (await fuelStationsRepo.getCountryById(stationId)) ||
    (await resolveDefaultCountryCode())
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

async function processCreditNote(row: TransactionQueueRow) {
  const maxRetries = Number(process.env.VPOS_TX_MAX_RETRIES ?? '5')
  const payload = parseQueuePayload(row.payload ?? {})
  const creditNoteId = String(payload?.creditNoteId ?? '')
  const transactionId = String(
    payload?.transactionId ?? row.transaction_id ?? '',
  )

  try {
    if (!isCreditNotePayload(payload)) {
      throw new Error('Queue item is not a credit note payload')
    }
    if (!creditNoteId || !transactionId) {
      throw new Error(
        'Credit note queue item is missing creditNoteId or transactionId',
      )
    }

    const [creditNote, txn] = await Promise.all([
      loadCreditNoteForQueueItem({
        stationId: row.station_id,
        creditNoteId,
        transactionId,
      }),
      transactionQueueRepo.findTransactionByTransactionId(
        transactionId,
        row.station_id,
      ),
    ])

    if (!creditNote) {
      throw new Error(`Credit note ${creditNoteId} not found`)
    }
    if (!txn) {
      throw new Error(`Transaction ${transactionId} not found`)
    }

    await updateLocalCreditNoteStatus({
      stationId: row.station_id,
      creditNoteId,
      status: 'PENDING',
      lastError: null,
    })

    const customer = txn?.customer_id
      ? await customersRepo.findById(txn.customer_id)
      : null

    const fiscalResult = await runCreditNoteFiscalization({
      stationId: row.station_id,
      transaction: txn,
      customer,
      creditNote,
    })

    const responsePayload = {
      localTanzania: {
        engine: fiscalResult.engine,
        route: 'local_tz',
        reference: fiscalResult.reference ?? null,
        requestPayload: fiscalResult.requestPayload ?? null,
        responsePayload: fiscalResult.responsePayload ?? null,
        rawResponse: fiscalResult.rawResponse ?? null,
        status: fiscalResult.status,
      },
    }

    if (fiscalResult.status === 'SUCCESS') {
      await updateLocalCreditNoteStatus({
        stationId: row.station_id,
        creditNoteId,
        status: 'SENT',
        response: responsePayload,
        lastError: null,
      })
      await enqueueFiscalInboxMessage({
        stationId: row.station_id,
        topic: 'fiscal',
        requestId: `credit-note-fiscalized:${creditNoteId}`,
        message: {
          type: 'creditNoteFiscalized',
          stationId: row.station_id,
          transactionId,
          creditNoteId,
          reference: fiscalResult.reference ?? null,
          at: Date.now(),
        },
      }).catch((err) => {
        logger.error('[vpos-transactions]', {
          msg: 'Failed to enqueue credit note fiscalized notification',
          error: serializeError(err),
        })
      })
      await markDone(row.id, row.station_id, { transactionId, creditNoteId })
      return
    }

    const errorMessage =
      fiscalResult.errorMessage ?? 'Credit note fiscalization failed'
    await updateLocalCreditNoteStatus({
      stationId: row.station_id,
      creditNoteId,
      status: 'FAILED',
      response: responsePayload,
      lastError: errorMessage,
    })
    throw new Error(errorMessage)
  } catch (e: any) {
    const msg = String(e?.message || e)
    await enqueueFiscalInboxReviewFailure({
      stationId: row.station_id,
      topic: 'external_fiscalization',
      requestId: creditNoteId
        ? `credit-note-fiscalization-review:${creditNoteId}`
        : `credit-note-queue-review:${row.id}`,
      error: e,
      message: {
        type: 'creditNoteFiscalizationReviewRequired',
        stationId: row.station_id,
        transactionId: transactionId || null,
        creditNoteId: creditNoteId || null,
        queueId: row.id,
        payload,
        error: msg,
        at: Date.now(),
      },
    }).catch((err) => {
      logger.error('[vpos-transactions]', {
        msg: 'Failed to enqueue credit note fiscal inbox review item',
        error: serializeError(err),
        queueId: row.id,
      })
    })
    if (creditNoteId) {
      await updateLocalCreditNoteStatus({
        stationId: row.station_id,
        creditNoteId,
        status: 'FAILED',
        lastError: msg,
      }).catch(() => {})
    }
    await markFailed({
      id: row.id,
      retryCount: row.retry_count ?? 0,
      maxRetries,
      errorMessage: msg,
    })
  }
}

async function processOne(row: TransactionQueueRow) {
  const maxRetries = Number(process.env.VPOS_TX_MAX_RETRIES ?? '5')
  let txnForReview: any = null
  try {
    if (!row.payload || typeof row.payload !== 'object') {
      throw new Error('Invalid transaction payload (expected object)')
    }

    if (isCreditNotePayload(row.payload)) {
      await processCreditNote(row)
      return
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
          error: serializeError(err),
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
          error: serializeError(err),
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
        error: serializeError(err),
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

const shouldYieldToForegroundDatabaseWork = () => {
  const pool = getPostgresPoolDiagnostics()
  if (pool.totalCount === 0) return false
  return (
    pool.waitingCount > 0 ||
    (pool.idleCount === 0 && pool.totalCount >= pool.max)
  )
}

async function workerLoop() {
  if (!(await tryAdvisoryLock(`worker:${WORKER_NAME}`))) return
  try {
    const claimed = await claimNextBatch(5)
    for (const row of claimed) {
      await processOne(row)
    }

    const creditNotes = await transactionQueueRepo.claimNextCreditNoteBatch(5)
    for (const row of creditNotes) {
      await processCreditNote(row)
    }
  } finally {
    await advisoryUnlock(`worker:${WORKER_NAME}`)
  }
}

async function runWorkerLoop() {
  if (stopRequested || loopInFlight || shouldYieldToForegroundDatabaseWork())
    return
  loopInFlight = true
  try {
    await workerLoop()
  } catch (error) {
    logger.error(`[${WORKER_NAME}]`, {
      msg: 'loop error',
      error: serializeError(error),
      pool: getPostgresPoolDiagnostics(),
    })
  } finally {
    loopInFlight = false
  }
}

async function runHeartbeat() {
  if (
    stopRequested ||
    heartbeatInFlight ||
    shouldYieldToForegroundDatabaseWork()
  ) {
    return
  }
  heartbeatInFlight = true
  try {
    await heartbeatAllStations()
  } catch (error) {
    logger.error(`[${WORKER_NAME}]`, {
      msg: 'heartbeat error',
      error: serializeError(error),
      pool: getPostgresPoolDiagnostics(),
    })
  } finally {
    heartbeatInFlight = false
  }
}

export function startTransactionQueueWorker(opts?: { pollMs?: number }) {
  // Idempotent: return existing controller if already started
  if (started && controller) return controller
  started = true
  stopRequested = false

  const pollMs = Math.max(200, opts?.pollMs ?? DEFAULT_POLL_MS)

  // kick immediately. Both loops are process-local single-flight so a slow
  // database acquisition cannot accumulate one Promise per interval tick.
  void runWorkerLoop()
  void runHeartbeat()

  loopTimer = setInterval(() => {
    void runWorkerLoop()
  }, pollMs)

  heartbeatTimer = setInterval(() => {
    void runHeartbeat()
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
      // Do not clear in-flight flags here: an async iteration may still be
      // unwinding. A replacement worker waits for that iteration to finish.
    },
  }
  return controller
}

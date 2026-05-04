import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { getEnvValue } from '@/src/shared/config/envDb'
import { submitInvoiceToProxy } from '@/src/shared/fiscalization/proxy/client'
import { mapTransactionToProxyInvoice } from '@/src/shared/fiscalization/proxy/mapper'
import {
  getFiscalizationResultsSinceViaProxy,
  getOfflineQueueItemViaProxy,
  getOfflineQueuePendingViaProxy,
} from '@/src/shared/proxy/client'
import { mapFiscalReceipt } from '@/src/shared/receipts/mapFiscalReceipt'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { enqueueFiscalInboxReviewFailure } from '@/src/shared/runtime/fiscalInbox'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getUserDisplayName } from '@/src/shared/server/users'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { safeAsync } from '@/src/shared/utils/safeAsync'
import { isUuid } from '@/src/shared/utils/uuid'

import { syncDeductionForTransaction } from '@/src/modules/tank-levels/application/legacyTransactionSync'
import { markTransactionFailed } from '@/src/modules/transactions/application/commands/mark-transaction-failed'
import { markTransactionFiscalized } from '@/src/modules/transactions/application/commands/mark-transaction-fiscalized'
import { getStationLinkingWindowSeconds } from '@/src/modules/transactions/infrastructure/linkingWindow'
import { getTransactionDetailsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction-read.repository'
import { mapTransactionInvoiceLines } from '@/src/modules/transactions/infrastructure/persistence/transaction.mapper'
import { claimEligibleProxyFiscalizationTransactionsRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

const WORKER_NAME = 'proxySenderWorker'
const HEARTBEAT_MS = 5_000

function isLinkingWindowExpired(
  txn: any,
  linkingWindowSeconds: number | null,
): boolean {
  const now = Date.now()
  const explicit = txn?.linking_window_expires_at
    ? new Date(txn.linking_window_expires_at).getTime()
    : NaN
  if (Number.isFinite(explicit)) return now >= explicit

  if (linkingWindowSeconds == null) return false

  const created = txn?.created_at ? new Date(txn.created_at).getTime() : NaN
  if (!Number.isFinite(created)) return false
  return now >= created + linkingWindowSeconds * 1000
}

async function loadStation(stationId: string) {
  return await queryOne<any>(`SELECT * FROM fuel_stations WHERE id = $1`, [
    stationId,
  ])
}
async function loadCustomer(stationId: string, customerId: string) {
  return await queryOne<any>(
    `SELECT * FROM customers WHERE station_id = $1 AND id = $2`,
    [stationId, customerId],
  )
}
async function vatRateForCountry(stationId: string, country: string | null) {
  const c = String(country || '').toUpperCase()
  if (c === 'TZ')
    return Number(
      (await getEnvValue(stationId, 'VPOS_VAT_RATE_TZ', '0.18')) || 0,
    )
  if (c === 'KE')
    return Number((await getEnvValue(stationId, 'VPOS_VAT_RATE_KE', '16')) || 0)
  return Number(
    (await getEnvValue(stationId, 'VPOS_VAT_RATE_DEFAULT', '0')) || 0,
  )
}

async function loadTransactionForProxySend(
  stationId: string,
  transactionId: string,
) {
  const detailed = await getTransactionDetailsRepo(stationId, transactionId)
  if (!detailed) return null

  return {
    ...detailed,
    lines: mapTransactionInvoiceLines(detailed.lines),
  }
}

async function tryClaimTransactionForImmediateProxySend(input: {
  stationId: string
  transactionId: string
}) {
  return await queryOne<any>(
    `UPDATE transactions
        SET status = 'FISCALIZING',
            linking_window_expires_at = NOW(),
            last_error = NULL,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2::uuid
        AND deleted_at IS NULL
        AND cloud_transaction_id IS NULL
        AND (fiscalization_reference IS NULL OR btrim(fiscalization_reference) = '')
        AND status IN ('OPEN','ALLOCATED','PENDING','FAILED')
    RETURNING *`,
    [input.stationId, input.transactionId],
  )
}

const FINAL_SUCCESS_STATUSES = new Set([
  'SUCCESS',
  'COMPLETED',
  'COMPLETE',
  'DONE',
  'FISCALIZED',
  'PROCESSED',
])

const FINAL_FAILURE_STATUSES = new Set([
  'FAILED',
  'ERROR',
  'REJECTED',
  'DECLINED',
  'CANCELLED',
  'CANCELED',
  'VOIDED',
])

function getPath(source: any, path: string) {
  return path.split('.').reduce((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return acc[key]
  }, source)
}

function trimString(value: any): string | null {
  const text = String(value ?? '').trim()
  return text.length ? text : null
}

function upperTrim(value: any): string | null {
  const text = trimString(value)
  return text ? text.toUpperCase() : null
}

function extractFirstString(source: any, paths: string[]): string | null {
  for (const path of paths) {
    const value = getPath(source, path)
    if (value === undefined || value === null) continue
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    const text = trimString(value)
    if (text) return text
  }
  return null
}

function safeParseJson(value: any) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function extractProxyDocumentId(source: any): string | null {
  return trimString(
    extractFirstString(source, [
      'documentId',
      'DocumentId',
      'document_id',
      'details.documentId',
      'details.DocumentId',
      'details.document_id',
      'data.documentId',
      'data.DocumentId',
      'data.document_id',
      'payload.documentId',
      'payload.DocumentId',
      'payload.document_id',
      'result.documentId',
      'result.DocumentId',
      'result.document_id',
      'response.documentId',
      'response.DocumentId',
      'response.document_id',
      'final.documentId',
      'final.DocumentId',
      'final.document_id',
      'submission.documentId',
      'submission.DocumentId',
      'submission.document_id',
      'invoice.documentId',
      'invoice.DocumentId',
      'invoice.document_id',
      'request.documentId',
      'request.DocumentId',
      'request.document_id',
    ]),
  )
}

function extractProxyDocumentNumber(source: any): string | null {
  return upperTrim(
    extractFirstString(source, [
      'documentNumber',
      'DocumentNumber',
      'document_number',
      'details.documentNumber',
      'details.DocumentNumber',
      'details.document_number',
      'data.documentNumber',
      'data.DocumentNumber',
      'data.document_number',
      'payload.documentNumber',
      'payload.DocumentNumber',
      'payload.document_number',
      'result.documentNumber',
      'result.DocumentNumber',
      'result.document_number',
      'response.documentNumber',
      'response.DocumentNumber',
      'response.document_number',
      'final.documentNumber',
      'final.DocumentNumber',
      'final.document_number',
      'submission.documentNumber',
      'submission.DocumentNumber',
      'submission.document_number',
      'request.documentNumber',
      'request.DocumentNumber',
      'request.document_number',
      'details.receiptNumber',
      'details.ReceiptNumber',
      'receipt.receiptNumber',
      'receipt.ReceiptNumber',
    ]),
  )
}

function extractProxyRequestId(
  source: any,
  opts?: { includeGenericId?: boolean },
): string | null {
  const paths = [
    'requestId',
    'RequestId',
    'request_id',
    'queueId',
    'QueueId',
    'queue_id',
    'itemId',
    'ItemId',
    'item_id',
    'submission.requestId',
    'submission.RequestId',
    'submission.request_id',
    'submission.queueId',
    'submission.QueueId',
    'submission.queue_id',
    'submission.itemId',
    'submission.ItemId',
    'submission.item_id',
    'details.requestId',
    'details.RequestId',
    'details.request_id',
    'details.queueId',
    'details.QueueId',
    'details.queue_id',
    'data.requestId',
    'data.RequestId',
    'data.request_id',
    'data.queueId',
    'data.QueueId',
    'data.queue_id',
    'payload.requestId',
    'payload.RequestId',
    'payload.request_id',
    'payload.queueId',
    'payload.QueueId',
    'payload.queue_id',
    'request.requestId',
    'request.RequestId',
    'request.request_id',
  ]

  if (opts?.includeGenericId !== false) paths.push('id', 'Id')

  return trimString(extractFirstString(source, paths))
}

function extractProxyStatus(source: any): string | null {
  return upperTrim(
    extractFirstString(source, [
      'status',
      'Status',
      'state',
      'State',
      'resultStatus',
      'ResultStatus',
      'processingStatus',
      'ProcessingStatus',
      'details.status',
      'details.Status',
      'details.state',
      'details.State',
      'data.status',
      'data.Status',
      'data.state',
      'data.State',
      'payload.status',
      'payload.Status',
      'payload.state',
      'payload.State',
      'result.status',
      'result.Status',
      'response.status',
      'response.Status',
      'final.status',
      'final.Status',
      'final.state',
      'final.State',
      'submission.status',
      'submission.Status',
      'submission.state',
      'submission.State',
    ]),
  )
}

function extractFailureMessage(source: any): string | null {
  return trimString(
    extractFirstString(source, [
      'message',
      'Message',
      'errorMessage',
      'ErrorMessage',
      'error_message',
      'error.message',
      'error.Message',
      'details.message',
      'details.Message',
      'details.errorMessage',
      'details.ErrorMessage',
      'details.error_message',
      'details.error.message',
      'data.message',
      'data.Message',
      'data.errorMessage',
      'data.ErrorMessage',
      'data.error_message',
      'data.error.message',
      'payload.message',
      'payload.Message',
      'payload.errorMessage',
      'payload.ErrorMessage',
      'payload.error_message',
      'payload.error.message',
      'response.message',
      'response.Message',
      'response.errorMessage',
      'response.ErrorMessage',
      'response.error_message',
      'response.error.message',
      'final.message',
      'final.Message',
      'final.errorMessage',
      'final.ErrorMessage',
      'final.error_message',
      'final.error.message',
      'submission.message',
      'submission.Message',
      'submission.errorMessage',
      'submission.ErrorMessage',
      'submission.error_message',
      'submission.error.message',
    ]),
  )
}

function extractProxyCorrelationKeys(source: any): string[] {
  return Array.from(
    new Set(
      [
        upperTrim(extractProxyDocumentId(source)),
        upperTrim(extractProxyDocumentNumber(source)),
        upperTrim(extractProxyRequestId(source, { includeGenericId: false })),
        upperTrim(
          extractFirstString(source, [
            'posReference',
            'PosReference',
            'pos_reference',
            'documentReference',
            'DocumentReference',
            'document_reference',
            'offlineDocumentNumber',
            'OfflineDocumentNumber',
            'offline_document_number',
            'transactionUniqueNumber',
            'TransactionUniqueNumber',
            'transaction_unique_number',
            'reference',
            'Reference',
            'details.posReference',
            'details.PosReference',
            'details.pos_reference',
            'details.documentReference',
            'details.DocumentReference',
            'details.document_reference',
            'details.offlineDocumentNumber',
            'details.OfflineDocumentNumber',
            'details.offline_document_number',
            'details.transactionUniqueNumber',
            'details.TransactionUniqueNumber',
            'details.transaction_unique_number',
            'data.posReference',
            'data.PosReference',
            'data.pos_reference',
            'payload.posReference',
            'payload.PosReference',
            'payload.pos_reference',
            'request.documentId',
            'request.DocumentId',
            'request.document_id',
          ]),
        ),
      ].filter(Boolean),
    ),
  ) as string[]
}

function extractProxyResults(data: any): any[] {
  if (Array.isArray(data)) return data

  const candidates = [
    data?.results,
    data?.items,
    data?.entries,
    data?.value,
    data?.pending,
    data?.data?.results,
    data?.data?.items,
    data?.data?.entries,
    data?.data?.value,
    data?.data?.pending,
    data?.payload?.results,
    data?.payload?.items,
    data?.payload?.entries,
    data?.payload?.value,
    data?.payload?.pending,
    data?.response?.results,
    data?.response?.items,
    data?.response?.entries,
    data?.response?.value,
    data?.response?.pending,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }

  if (data && typeof data === 'object') {
    const hasResultShape = Boolean(
      extractProxyCorrelationKeys(data).length || extractProxyStatus(data),
    )
    if (hasResultShape) return [data]
  }

  return []
}

function hasFinalFiscalizationPayload(source: any): boolean {
  const receipt = mapFiscalReceipt(source)
  const hasReceiptEvidence = Boolean(
    receipt?.receiptNumber ||
    receipt?.receiptSignature ||
    receipt?.fiscalVerificationCode ||
    receipt?.fiscalQrCodeData ||
    receipt?.receiptInternalData,
  )
  if (hasReceiptEvidence) return true

  const fiscalizedFlag = upperTrim(
    extractFirstString(source, [
      'isFiscalized',
      'is_fiscalized',
      'details.isFiscalized',
      'details.is_fiscalized',
      'data.isFiscalized',
      'data.is_fiscalized',
      'payload.isFiscalized',
      'payload.is_fiscalized',
      'final.isFiscalized',
      'final.is_fiscalized',
    ]),
  )
  const docNo = extractProxyDocumentNumber(source)
  if (docNo && ['TRUE', '1', 'YES'].includes(fiscalizedFlag || '')) return true

  const status = extractProxyStatus(source)
  if (docNo && status && FINAL_SUCCESS_STATUSES.has(status)) return true

  return false
}

function isFailedFiscalizationPayload(source: any): boolean {
  const status = extractProxyStatus(source)
  if (status && FINAL_FAILURE_STATUSES.has(status)) return true

  const explicitError = getPath(source, 'error')
  const nestedError = getPath(source, 'details.error')
  const dataError = getPath(source, 'data.error')
  const payloadError = getPath(source, 'payload.error')
  const responseError = getPath(source, 'response.error')
  const finalError = getPath(source, 'final.error')
  const submissionError = getPath(source, 'submission.error')

  return [
    explicitError,
    nestedError,
    dataError,
    payloadError,
    responseError,
    finalError,
    submissionError,
  ].some((value) => value === true)
}

function mergeFiscalizationResponses(submission: any, final: any) {
  const submissionObj =
    submission && typeof submission === 'object'
      ? submission
      : { value: submission }
  const finalObj = final && typeof final === 'object' ? final : { value: final }

  return {
    ...submissionObj,
    ...finalObj,
    submission: submission ?? null,
    final: final ?? null,
    finalReceivedAt: new Date().toISOString(),
  }
}

async function persistProxySubmission(input: {
  stationId: string
  transactionId: string
  fiscalDocumentId?: string | null
  cloudTransactionId?: string | null
  fiscalizationResponse: unknown
}) {
  const cloudTransactionId = isUuid(String(input.cloudTransactionId || ''))
    ? String(input.cloudTransactionId)
    : null

  return await queryOne<any>(
    `UPDATE transactions
        SET status = 'FISCALIZING',
            fiscal_document_id = COALESCE(NULLIF(BTRIM(CAST($3 AS text)), ''), fiscal_document_id),
            cloud_transaction_id = COALESCE($4::uuid, cloud_transaction_id),
            fiscalization_response = $5,
            last_error = NULL,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2::uuid
        AND deleted_at IS NULL
    RETURNING *`,
    [
      input.stationId,
      input.transactionId,
      input.fiscalDocumentId ?? null,
      cloudTransactionId,
      JSON.stringify(input.fiscalizationResponse ?? null),
    ],
  )
}

async function listPendingProxyFiscalizationTransactions(
  stationId: string,
  limit = 50,
) {
  return await queryAll<any>(
    `SELECT id,
            station_id,
            pos_reference,
            status,
            fiscal_document_id,
            cloud_transaction_id,
            fiscalization_response,
            created_at,
            updated_at
       FROM transactions
      WHERE station_id = $1
        AND deleted_at IS NULL
        AND status = 'FISCALIZING'
        AND (fiscalization_reference IS NULL OR btrim(fiscalization_reference) = '')
      ORDER BY updated_at ASC
      LIMIT $2`,
    [stationId, limit],
  )
}

function matchesFiscalizationResult(txn: any, result: any): boolean {
  const stored = safeParseJson(txn?.fiscalization_response)
  const candidateKeys = new Set(
    [
      upperTrim(txn?.fiscal_document_id),
      upperTrim(String(txn?.cloud_transaction_id || '')),
      upperTrim(String(txn?.pos_reference || '')),
      ...extractProxyCorrelationKeys(stored),
    ].filter(Boolean) as string[],
  )
  if (!candidateKeys.size) return false

  const resultKeys = extractProxyCorrelationKeys(result)
  return resultKeys.some((value) => candidateKeys.has(value))
}

async function reconcilePendingProxyFiscalizations(input: {
  stationId: string
  pendingLimit?: number
  resultsLimit?: number
}) {
  const pending = await listPendingProxyFiscalizationTransactions(
    input.stationId,
    Math.max(1, Number(input.pendingLimit ?? 50)),
  )
  if (!pending.length) {
    return { checked: 0, finalized: 0, failed: 0, polledResults: 0 }
  }

  const oldestPendingAt = pending.reduce((acc, row) => {
    const ts = row?.updated_at ? new Date(row.updated_at).getTime() : NaN
    if (!Number.isFinite(ts)) return acc
    return Math.min(acc, ts)
  }, Date.now())

  const sinceMs = Math.max(
    oldestPendingAt - 5 * 60 * 1000,
    Date.now() - 24 * 60 * 60 * 1000,
  )

  let results: any[] = []
  try {
    const sinceRes = await getFiscalizationResultsSinceViaProxy(
      input.stationId,
      {
        since: new Date(sinceMs).toISOString(),
        limit: Math.max(25, Number(input.resultsLimit ?? 200)),
      },
    )

    if (!sinceRes.ok) {
      logger.warn(`[${WORKER_NAME}] proxy result reconciliation poll failed`, {
        stationId: input.stationId,
        status: sinceRes.status,
      })
    } else {
      results = extractProxyResults(sinceRes.data)
    }
  } catch (error: any) {
    logger.warn(`[${WORKER_NAME}] proxy result reconciliation poll errored`, {
      stationId: input.stationId,
      error: String(error?.message || error),
    })
  }

  if (!results.length) {
    try {
      const pendingRes = await getOfflineQueuePendingViaProxy(input.stationId)
      if (!pendingRes.ok) {
        logger.warn(
          `[${WORKER_NAME}] proxy offline queue pending poll failed`,
          {
            stationId: input.stationId,
            status: pendingRes.status,
          },
        )
      } else {
        results = extractProxyResults(pendingRes.data)
      }
    } catch (error: any) {
      logger.warn(`[${WORKER_NAME}] proxy offline queue pending poll errored`, {
        stationId: input.stationId,
        error: String(error?.message || error),
      })
    }
  }

  if (pending.length && !results.length) {
    logger.warn(
      `[${WORKER_NAME}] no proxy reconciliation results for pending fiscalizations`,
      {
        stationId: input.stationId,
        pendingCount: pending.length,
        since: new Date(sinceMs).toISOString(),
        transactionIds: pending.map((row) => String(row.id)),
      },
    )
  }

  let finalized = 0
  let failed = 0

  for (const txn of pending) {
    const stored = safeParseJson(txn?.fiscalization_response)
    let matched = results.find((result) =>
      matchesFiscalizationResult(txn, result),
    )

    if (!matched) {
      const requestId = extractProxyRequestId(stored, {
        includeGenericId: false,
      })
      if (requestId) {
        try {
          const lookup = await getOfflineQueueItemViaProxy(
            input.stationId,
            requestId,
          )
          if (lookup.ok) matched = lookup.data
        } catch (error: any) {
          logger.warn(`[${WORKER_NAME}] proxy offline item lookup failed`, {
            stationId: input.stationId,
            transactionId: String(txn.id),
            requestId,
            error: String(error?.message || error),
          })
        }
      }
    }

    if (!matched) {
      logger.warn(
        `[${WORKER_NAME}] pending proxy fiscalization has no matching proxy result`,
        {
          stationId: input.stationId,
          transactionId: String(txn.id),
          candidateKeys: [
            upperTrim(txn?.fiscal_document_id),
            upperTrim(String(txn?.cloud_transaction_id || '')),
            upperTrim(String(txn?.pos_reference || '')),
            ...extractProxyCorrelationKeys(stored),
          ].filter(Boolean),
        },
      )
      continue
    }

    const merged = mergeFiscalizationResponses(stored, matched)
    const matchedDocId =
      extractProxyDocumentId(matched) ||
      extractProxyDocumentId(stored) ||
      trimString(txn?.fiscal_document_id)

    if (
      !hasFinalFiscalizationPayload(matched) &&
      !isFailedFiscalizationPayload(matched)
    ) {
      const matchedRequestId = extractProxyRequestId(matched, {
        includeGenericId: false,
      })
      const storedRequestId = extractProxyRequestId(stored, {
        includeGenericId: false,
      })
      const matchedDocNumber = extractProxyDocumentNumber(matched)
      const storedDocNumber = extractProxyDocumentNumber(stored)

      const shouldRefreshStoredSubmission = Boolean(
        matchedRequestId ||
        (!storedDocNumber && matchedDocNumber) ||
        (!extractProxyDocumentId(stored) && extractProxyDocumentId(matched)),
      )

      if (shouldRefreshStoredSubmission) {
        await persistProxySubmission({
          stationId: input.stationId,
          transactionId: String(txn.id),
          fiscalDocumentId: matchedDocId,
          cloudTransactionId: matchedRequestId || storedRequestId,
          fiscalizationResponse: merged,
        }).catch(() => {})
      }

      continue
    }

    if (isFailedFiscalizationPayload(matched)) {
      await markTransactionFailed({
        stationId: input.stationId,
        transactionId: String(txn.id),
        lastError:
          extractFailureMessage(matched) || 'Proxy fiscalization failed',
        incrementRetryCount: true,
        fiscalDocumentId: matchedDocId,
        fiscalizationResponse: merged,
      }).catch(() => {})

      logger.warn(`[${WORKER_NAME}] proxy fiscalization result marked failed`, {
        stationId: input.stationId,
        transactionId: String(txn.id),
        documentId: matchedDocId,
        status: extractProxyStatus(matched),
      })

      failed += 1
      continue
    }

    if (!hasFinalFiscalizationPayload(matched)) continue

    const receipt = mapFiscalReceipt(merged) || mapFiscalReceipt(matched)
    const fiscalReference =
      upperTrim(receipt?.documentNumber) ||
      upperTrim(receipt?.receiptNumber) ||
      extractProxyDocumentNumber(matched) ||
      extractProxyDocumentNumber(stored)

    await markTransactionFiscalized({
      stationId: input.stationId,
      transactionId: String(txn.id),
      fiscalizationReference: fiscalReference,
      fiscalDocumentId: matchedDocId,
      fiscalizationResponse: merged,
    })

    await syncDeductionForTransaction({
      stationId: input.stationId,
      transactionId: String(txn.id),
    }).catch((err) => {
      logger.error(`[${WORKER_NAME}] Failed to sync tank deduction`, {
        error: err,
        transactionId: String(txn.id),
      })
    })

    logger.info(`[${WORKER_NAME}] proxy fiscalization result reconciled`, {
      stationId: input.stationId,
      transactionId: String(txn.id),
      documentId: matchedDocId,
      documentNumber: fiscalReference,
      status: extractProxyStatus(matched),
    })

    finalized += 1
  }

  return {
    checked: pending.length,
    finalized,
    failed,
    polledResults: results.length,
  }
}

export async function sendClaimedTransactionToProxy(input: {
  stationId: string
  station: any
  txn: any
  linkingWindowSeconds: number | null
  trigger: 'worker' | 'sendNow'
}) {
  const { stationId, station, txn, linkingWindowSeconds, trigger } = input

  let docId: string | null = null
  let docNo: string | null = null

  try {
    const customer =
      txn.customer_id != null
        ? await loadCustomer(stationId, txn.customer_id)
        : null
    const country = station?.country
      ? String(station.country).toUpperCase()
      : null
    const defaultTaxType = await loadDefaultTaxType()
    const vatRate =
      defaultTaxType?.rate != null
        ? Number(defaultTaxType.rate)
        : await vatRateForCountry(stationId, country)
    const createdByName = await getUserDisplayName(txn.allocated_by)

    const fullTxn =
      (await loadTransactionForProxySend(stationId, String(txn.id))) ?? txn
    const pumpNumber =
      fullTxn.pump_number != null ? Number(fullTxn.pump_number) : null
    const enrichment = await resolveEnrichmentFromTables(
      stationId,
      String(fullTxn.id ?? txn.id),
      pumpNumber,
      fullTxn.fuel_type ?? txn.fuel_type ?? null,
    )

    const invoice = mapTransactionToProxyInvoice({
      transaction: fullTxn,
      customer,
      station,
      vatRate,
      taxType: defaultTaxType?.code ?? null,
      taxRate: defaultTaxType?.rate ?? null,
      createdByName,
      enrichment,
    })

    logger.info(`[${WORKER_NAME}] submitting transaction to proxy`, {
      stationId,
      transactionId: String(txn.id),
      trigger,
      hasCustomer: !!txn.customer_id,
      lineCount: Array.isArray(fullTxn?.lines) ? fullTxn.lines.length : 0,
      linkingWindowExpired: isLinkingWindowExpired(txn, linkingWindowSeconds),
    })

    getRuntimeBus().publish('proxy', {
      type: 'proxySendAttempt',
      stationId,
      transactionId: String(txn.id),
      hasCustomer: !!txn.customer_id,
      linkingWindowExpired: isLinkingWindowExpired(txn, linkingWindowSeconds),
      trigger,
      at: Date.now(),
    })

    const res = await submitInvoiceToProxy(stationId, invoice, {
      idempotencyKey: `${stationId}:${txn.id}`,
    })
    if (!res.ok)
      throw new Error(
        `Proxy submit failed: ${res.status} ${JSON.stringify(res.data)}`,
      )

    docId = extractProxyDocumentId(res.data)
    docNo = extractProxyDocumentNumber(res.data)

    const requestId = extractProxyRequestId(res.data, {
      includeGenericId: false,
    })
    const hasFinalPayload = hasFinalFiscalizationPayload(res.data)
    const hasFailurePayload = isFailedFiscalizationPayload(res.data)

    try {
      if (hasFailurePayload) {
        await markTransactionFailed({
          stationId,
          transactionId: String(txn.id),
          lastError:
            extractFailureMessage(res.data) || 'Proxy fiscalization failed',
          incrementRetryCount: true,
          fiscalDocumentId: docId,
          fiscalizationResponse: res.data ?? {},
        })
        await enqueueFiscalInboxReviewFailure({
          stationId,
          topic: 'external_fiscalization',
          requestId: `proxy-fiscalization-review:${txn.id}`,
          error:
            extractFailureMessage(res.data) || 'Proxy fiscalization failed',
          message: {
            type: 'proxyFiscalizationReviewRequired',
            stationId,
            transactionId: String(txn.id),
            documentId: docId,
            documentNumber: docNo,
            response: res.data ?? null,
            at: Date.now(),
          },
        }).catch((err) => {
          logger.error(
            `[${WORKER_NAME}] failed to enqueue fiscal inbox review`,
            {
              stationId,
              transactionId: String(txn.id),
              error: String((err as any)?.message || err),
            },
          )
        })
      } else if (hasFinalPayload) {
        await markTransactionFiscalized({
          stationId,
          transactionId: String(txn.id),
          fiscalizationReference: docNo,
          fiscalDocumentId: docId,
          fiscalizationResponse: res.data ?? {},
        })
      } else {
        await persistProxySubmission({
          stationId,
          transactionId: String(txn.id),
          fiscalDocumentId: docId,
          cloudTransactionId: requestId,
          fiscalizationResponse: {
            submission: res.data ?? {},
            requestId,
            documentId: docId,
            documentNumber: docNo,
            submittedAt: new Date().toISOString(),
            submitStatus: res.status,
            final: null,
          },
        })
      }
    } catch (error: any) {
      logger.error(
        `[${WORKER_NAME}] proxy submit succeeded but local fiscalization update failed`,
        {
          stationId,
          transactionId: String(txn.id),
          trigger,
          documentId: docId,
          documentNumber: docNo,
          hasFinalPayload,
          error: String(error?.message || error),
        },
      )
      throw error
    }

    if (hasFailurePayload) {
      logger.warn(`[${WORKER_NAME}] proxy submit returned terminal failure`, {
        stationId,
        transactionId: String(txn.id),
        trigger,
        documentId: docId,
        documentNumber: docNo,
        status: extractProxyStatus(res.data),
        message: extractFailureMessage(res.data),
      })
    } else if (hasFinalPayload) {
      await syncDeductionForTransaction({
        stationId,
        transactionId: String(txn.id),
      }).catch((err) => {
        logger.error(`[${WORKER_NAME}] Failed to sync tank deduction`, {
          error: err,
          transactionId: String(txn.id),
        })
      })

      logger.info(`[${WORKER_NAME}] proxy submit succeeded`, {
        stationId,
        transactionId: String(txn.id),
        trigger,
        documentId: docId,
        documentNumber: docNo,
        finalized: true,
      })
    } else {
      logger.info(
        `[${WORKER_NAME}] proxy submit accepted; awaiting final result`,
        {
          stationId,
          transactionId: String(txn.id),
          trigger,
          documentId: docId,
          documentNumber: docNo,
          requestId,
        },
      )
    }

    getRuntimeBus().publish('proxy', {
      type: 'proxySendSuccess',
      stationId,
      transactionId: String(txn.id),
      documentId: docId,
      documentNumber: docNo,
      trigger,
      awaitingFinalResult: !hasFinalPayload,
      at: Date.now(),
    })

    return {
      ok: true as const,
      documentId: docId,
      documentNumber: docNo,
      awaitingFinalResult: !hasFinalPayload,
    }
  } catch (e: any) {
    logger.error(`[${WORKER_NAME}] proxy submit failed`, {
      stationId,
      transactionId: String(txn.id),
      trigger,
      error: String(e?.message || e),
    })

    getRuntimeBus().publish('proxy', {
      type: 'proxySendFailed',
      stationId,
      transactionId: String(txn.id),
      error: String(e?.message || e),
      trigger,
      at: Date.now(),
    })

    await markTransactionFailed({
      stationId,
      transactionId: String(txn.id),
      lastError: String(e?.message || e),
      incrementRetryCount: true,
      fiscalDocumentId: docId,
    }).catch(() => {})
    await enqueueFiscalInboxReviewFailure({
      stationId,
      topic: 'external_fiscalization',
      requestId: `proxy-fiscalization-review:${txn.id}`,
      error: e,
      message: {
        type: 'proxyFiscalizationReviewRequired',
        stationId,
        transactionId: String(txn.id),
        documentId: docId,
        trigger,
        error: String(e?.message || e),
        at: Date.now(),
      },
    }).catch((err) => {
      logger.error(`[${WORKER_NAME}] failed to enqueue fiscal inbox review`, {
        stationId,
        transactionId: String(txn.id),
        error: String((err as any)?.message || err),
      })
    })

    return { ok: false as const, error: String(e?.message || e) }
  }
}

export async function sendTransactionToProxyNow(input: {
  stationId: string
  transactionId: string
}) {
  const station = await safeAsync(
    loadStation(input.stationId),
    'proxySenderWorker.sendNow.loadStation',
  )
  const linkingWindowSeconds = await getStationLinkingWindowSeconds(
    input.stationId,
  )
  const claimed = await tryClaimTransactionForImmediateProxySend(input)

  if (!claimed) {
    return {
      ok: false as const,
      skipped: true as const,
      reason: 'Transaction was not eligible for immediate proxy send',
    }
  }

  return await sendClaimedTransactionToProxy({
    stationId: input.stationId,
    station,
    txn: claimed,
    linkingWindowSeconds,
    trigger: 'sendNow',
  })
}

async function loadDefaultTaxType() {
  const row = await queryOne<{ code: string; rate: number | string | null }>(
    `SELECT code, rate
     FROM cfg_tax_types
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, name ASC
     LIMIT 1`,
  )

  if (!row?.code) return null
  const rate =
    row.rate === null || row.rate === undefined ? null : Number(row.rate)
  return {
    code: String(row.code),
    rate: Number.isFinite(rate) ? rate : null,
  }
}

/**
 * Resolve pump, nozzle, tank, and product details directly from
 * the relational tables (pumps → nozzles → tanks → products).
 */
async function resolveEnrichmentFromTables(
  stationId: string,
  transactionId: string,
  pumpNumber: number | null,
  fuelType?: string | null,
) {
  if (pumpNumber == null) return {}

  const pump = await queryOne<{ id: string }>(
    `SELECT id FROM pumps WHERE station_id = $1 AND pump_number = $2`,
    [stationId, pumpNumber],
  )
  if (!pump) return { pumpId: String(pumpNumber) }

  const nozzles = await queryAll<{
    id: string
    tank_id: string | null
    nozzle_number: number | null
  }>(
    `SELECT id, tank_id, nozzle_number FROM nozzles WHERE station_id = $1 AND pump_id = $2 ORDER BY nozzle_number`,
    [stationId, pump.id],
  )
  if (!nozzles.length) return { pumpId: String(pump.id) }

  let bestNozzle = nozzles[0]
  let bestProduct: any = null

  for (const nz of nozzles) {
    if (!nz.tank_id) continue
    const tank = await queryOne<{
      id: string
      name?: string
      product_id?: string | null
    }>(
      `SELECT id, name, product_id FROM tanks WHERE id = $1 AND station_id = $2`,
      [nz.tank_id, stationId],
    )
    if (!tank?.product_id) continue

    const product = await queryOne<any>(
      `SELECT id, product_id, product_code, product_name, unit_of_measure,
              product_class_code, product_type_code, commodity_code, hazardous_indicator,
              ext_product_id, ext_product_code, ext_product_class_code, ext_product_type_code,
              ext_description, ext_unit_of_measure, ext_unit_of_packaging, ext_unit_price,
              ext_currency, ext_tax_code, ext_hazardous_indicator, tax_rate
       FROM products WHERE id = $1 AND station_id = $2`,
      [tank.product_id, stationId],
    )
    if (!product) continue

    const fuelKey = String(fuelType ?? '')
      .trim()
      .toLowerCase()
    const matches =
      fuelKey &&
      ((product.product_name &&
        product.product_name.toLowerCase().includes(fuelKey)) ||
        (tank.name && tank.name.toLowerCase().includes(fuelKey)))
    if (matches || !bestProduct) {
      bestNozzle = nz
      bestProduct = { ...product, tankId: tank.id, tankName: tank.name }
      if (matches) break
    }
  }

  // Fallback: resolve tank for first nozzle if no product found yet
  if (!bestProduct && bestNozzle.tank_id) {
    const tank = await queryOne<{
      id: string
      name?: string
      product_id?: string | null
    }>(
      `SELECT id, name, product_id FROM tanks WHERE id = $1 AND station_id = $2`,
      [bestNozzle.tank_id, stationId],
    )
    if (tank?.product_id) {
      const product = await queryOne<any>(
        `SELECT id, product_id, product_code, product_name, unit_of_measure,
                product_class_code, product_type_code, commodity_code, hazardous_indicator,
                ext_product_id, ext_product_code, ext_product_class_code, ext_product_type_code,
                ext_description, ext_unit_of_measure, ext_unit_of_packaging, ext_unit_price,
                ext_currency, ext_tax_code, ext_hazardous_indicator, tax_rate
         FROM products WHERE id = $1 AND station_id = $2`,
        [tank.product_id, stationId],
      )
      if (product)
        bestProduct = { ...product, tankId: tank.id, tankName: tank.name }
    }
  }

  const line = await queryOne<{
    unit_price: number | string | null
    tax_rate: number | string | null
  }>(
    `SELECT tl.unit_price, p.tax_rate
     FROM transaction_lines tl
     LEFT JOIN products p
       ON p.id = tl.product_id
      AND p.station_id = $1
     WHERE tl.transaction_id = $2::uuid
     ORDER BY tl.created_at ASC
     LIMIT 1`,
    [stationId, transactionId],
  )

  return {
    pumpId: String(pump.id),
    nozzleId: String(bestNozzle.id),
    tankId:
      bestProduct?.tankId ??
      (bestNozzle.tank_id ? String(bestNozzle.tank_id) : null),
    gradeId: bestProduct?.product_id ?? bestProduct?.product_code ?? null,
    gradeName: bestProduct?.product_name ?? bestProduct?.tankName ?? null,
    // ext_ fields take priority over standard fields
    productId: bestProduct?.ext_product_id ?? bestProduct?.product_id ?? null,
    productCode:
      bestProduct?.ext_product_code ?? bestProduct?.product_code ?? null,
    productClassCode:
      bestProduct?.ext_product_class_code ??
      bestProduct?.product_class_code ??
      null,
    productTypeCode:
      bestProduct?.ext_product_type_code ??
      bestProduct?.product_type_code ??
      null,
    unitOfMeasure:
      bestProduct?.ext_unit_of_measure ?? bestProduct?.unit_of_measure ?? null,
    unitOfPackaging: bestProduct?.ext_unit_of_packaging ?? null,
    unitPrice:
      bestProduct?.ext_unit_price != null
        ? Number(bestProduct.ext_unit_price)
        : line?.unit_price != null
          ? Number(line.unit_price)
          : null,
    taxRate:
      line?.tax_rate != null && Number.isFinite(Number(line.tax_rate))
        ? Number(line.tax_rate)
        : bestProduct?.tax_rate != null &&
            Number.isFinite(Number(bestProduct.tax_rate))
          ? Number(bestProduct.tax_rate)
          : null,
    currency: bestProduct?.ext_currency ?? null,
    taxCode: bestProduct?.ext_tax_code ?? null,
    commodityCode: bestProduct?.commodity_code ?? null,
    hazardousIndicator:
      bestProduct?.ext_hazardous_indicator != null
        ? bestProduct.ext_hazardous_indicator
        : (bestProduct?.hazardous_indicator ?? null),
    description:
      bestProduct?.ext_description ?? bestProduct?.product_name ?? null,
  }
}

export function startProxyFiscalSenderWorker(opts?: {
  pollMs?: number
  stationId?: string
}) {
  const pollMs = opts?.pollMs ?? 1000
  const stationId = opts?.stationId || getStationId()
  const maxInFlight = Math.max(
    1,
    Math.min(20, Number(process.env.VPOS_PROXY_SENDER_MAX_IN_FLIGHT ?? '4')),
  )
  const reconcilePollMs = Math.max(
    pollMs,
    Number(process.env.VPOS_PROXY_RECONCILE_POLL_MS ?? '5000'),
  )
  const pendingLimit = Math.max(
    maxInFlight * 4,
    Number(process.env.VPOS_PROXY_RECONCILE_PENDING_LIMIT ?? '50'),
  )
  const resultsLimit = Math.max(
    pendingLimit * 4,
    Number(process.env.VPOS_PROXY_RECONCILE_RESULTS_LIMIT ?? '200'),
  )

  let stopped = false
  let tickRunning = false
  let lastReconcileAt = 0
  const inFlight = new Map<string, Promise<unknown>>()

  logger.info(`[${WORKER_NAME}] starting`, {
    stationId,
    pollMs,
    maxInFlight,
    reconcilePollMs,
  })

  function dispatchSend(
    station: any,
    txn: any,
    linkingWindowSeconds: number | null,
  ) {
    const transactionId = String(txn.id)
    const run = sendClaimedTransactionToProxy({
      stationId,
      station,
      txn,
      linkingWindowSeconds,
      trigger: 'worker',
    }).finally(() => {
      inFlight.delete(transactionId)
    })

    inFlight.set(transactionId, run)
  }

  async function tick() {
    if (stopped || tickRunning) return
    tickRunning = true

    try {
      const station = await safeAsync(
        loadStation(stationId),
        'proxySenderWorker.loadStation',
      )
      const linkingWindowSeconds =
        await getStationLinkingWindowSeconds(stationId)

      if (Date.now() - lastReconcileAt >= reconcilePollMs) {
        const summary = await reconcilePendingProxyFiscalizations({
          stationId,
          pendingLimit,
          resultsLimit,
        })
        lastReconcileAt = Date.now()

        if (summary.finalized > 0 || summary.failed > 0) {
          logger.info(`[${WORKER_NAME}] proxy result reconciliation summary`, {
            stationId,
            ...summary,
          })
        }
      }

      const capacity = Math.max(0, maxInFlight - inFlight.size)
      if (capacity <= 0) return

      const rows = await claimEligibleProxyFiscalizationTransactionsRepo({
        stationId,
        linkingWindowSeconds,
        limit: capacity,
      })

      if (rows.length > 0) {
        logger.info(`[${WORKER_NAME}] claimed proxy fiscalization batch`, {
          stationId,
          count: rows.length,
          transactionIds: rows.map((row) => String(row.id)),
          inFlight: inFlight.size,
          capacity,
        })
      }

      for (const txn of rows) {
        dispatchSend(station, txn, linkingWindowSeconds)
      }
    } finally {
      tickRunning = false
    }
  }

  const hbTimer = setInterval(
    () =>
      upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        status: 'OK',
        connected: true,
        metrics: {
          pollMs,
          maxInFlight,
          inFlight: inFlight.size,
          reconcilePollMs,
        },
      }).catch(() => {}),
    HEARTBEAT_MS,
  )

  const timer = setInterval(() => tick().catch(() => {}), pollMs)
  tick().catch(() => {})
  return () => {
    stopped = true
    clearInterval(timer)
    clearInterval(hbTimer)
  }
}

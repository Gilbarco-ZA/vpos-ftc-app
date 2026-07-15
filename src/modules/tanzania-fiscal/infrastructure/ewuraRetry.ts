import type { EwuraQueueTable, EwuraRetryRow } from './db'
import type { EwuraPayloadType } from './ewura'
import { readTanzaniaFiscalConfig } from './config'
import {
  claimReadyEwuraReports,
  claimReadyEwuraTransactions,
  markEwuraReportSent,
  markEwuraRetryScheduled,
  markEwuraTransactionSent,
  getEwuraQueueHealth as readEwuraQueueHealth,
} from './db'
import { EWURA_ENDPOINTS, postEwuraXml } from './ewura'

export type EwuraRetryDecision = {
  retryable: boolean
  terminal: boolean
  attemptsUsed: number
  attemptsRemaining: number
  nextAttemptAt: Date | null
  reason: string
}

export type EwuraPartialFiscalizationPolicy = {
  failureMode: 'async_retry' | 'block_transaction'
  blockTransaction: boolean
  responseStatus: 'SUCCESS' | 'FAILED'
  fiscalizationState:
    | 'TRA_AND_EWURA_CONFIRMED'
    | 'TRA_CONFIRMED_EWURA_PENDING'
    | 'TRA_CONFIRMED_EWURA_FAILED_BLOCKING'
  auditMessage: string
}

const NON_RETRYABLE_PATTERNS = [
  /apiSourceId and licenseNo are required/i,
  /base URL is not configured/i,
  /signing key is not configured/i,
  /private key/i,
  /certificate/i,
  /invalid payload/i,
]

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function parseHttpStatus(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function computeEwuraRetryDelaySeconds(args: {
  retryCount: number
  baseDelaySeconds: number
  maxDelaySeconds: number
}) {
  const retryCount = clampInt(args.retryCount, 0, 0, 100)
  const baseDelaySeconds = clampInt(args.baseDelaySeconds, 60, 1, 86400)
  const maxDelaySeconds = clampInt(args.maxDelaySeconds, 3600, 60, 86400)
  const exponential = baseDelaySeconds * Math.pow(2, Math.max(0, retryCount))
  return Math.min(exponential, maxDelaySeconds)
}

export function classifyEwuraFailure(args: {
  error?: string | null
  responsePayload?: any
  retryCount: number
  maxAttempts: number
  baseDelaySeconds: number
  maxDelaySeconds: number
  now?: Date
}): EwuraRetryDecision {
  const now = args.now ?? new Date()
  const maxAttempts = clampInt(args.maxAttempts, 20, 1, 100)
  const retryCount = clampInt(args.retryCount, 0, 0, 100)
  const nextAttemptNumber = retryCount + 1
  const attemptsRemaining = Math.max(0, maxAttempts - nextAttemptNumber)
  const error = String(args.error ?? '').trim()
  const payload = args.responsePayload ?? {}
  const httpStatus = parseHttpStatus(payload.httpStatus)
  const ewuraCode = String(payload.code ?? payload.Code ?? '').trim()
  const message = String(payload.message ?? payload.Message ?? '').trim()
  const combined = `${error} ${message}`.trim()
  const nonRetryableByMessage = NON_RETRYABLE_PATTERNS.some((pattern) =>
    pattern.test(combined),
  )
  const nonRetryableByStatus =
    httpStatus != null &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    httpStatus !== 408
  const exhausted = nextAttemptNumber >= maxAttempts
  const successLikeCode = ewuraCode === '200'
  const retryable =
    !successLikeCode &&
    !exhausted &&
    !nonRetryableByMessage &&
    !nonRetryableByStatus

  if (!retryable) {
    return {
      retryable: false,
      terminal: true,
      attemptsUsed: Math.min(nextAttemptNumber, maxAttempts),
      attemptsRemaining,
      nextAttemptAt: null,
      reason: exhausted
        ? `EWURA retry attempts exhausted after ${maxAttempts} attempts.`
        : nonRetryableByStatus
          ? `EWURA returned non-retryable HTTP ${httpStatus}.`
          : nonRetryableByMessage
            ? 'EWURA failure requires configuration/certificate/payload correction before retry.'
            : 'EWURA failure is terminal.',
    }
  }

  const delaySeconds = computeEwuraRetryDelaySeconds({
    retryCount,
    baseDelaySeconds: args.baseDelaySeconds,
    maxDelaySeconds: args.maxDelaySeconds,
  })
  return {
    retryable: true,
    terminal: false,
    attemptsUsed: nextAttemptNumber,
    attemptsRemaining,
    nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000),
    reason: `EWURA retry scheduled in ${delaySeconds} seconds.`,
  }
}

export function getEwuraPartialFiscalizationPolicy(args: {
  failureMode?: 'async_retry' | 'block_transaction' | null
  ewuraOk: boolean
}): EwuraPartialFiscalizationPolicy {
  if (args.ewuraOk) {
    return {
      failureMode: args.failureMode ?? 'async_retry',
      blockTransaction: false,
      responseStatus: 'SUCCESS',
      fiscalizationState: 'TRA_AND_EWURA_CONFIRMED',
      auditMessage: 'TRA and EWURA fiscalization both completed.',
    }
  }

  const mode =
    args.failureMode === 'block_transaction'
      ? 'block_transaction'
      : 'async_retry'
  if (mode === 'block_transaction') {
    return {
      failureMode: mode,
      blockTransaction: true,
      responseStatus: 'FAILED',
      fiscalizationState: 'TRA_CONFIRMED_EWURA_FAILED_BLOCKING',
      auditMessage:
        'TRA fiscalization completed but EWURA failed; station policy blocks completion until EWURA is fixed.',
    }
  }

  return {
    failureMode: mode,
    blockTransaction: false,
    responseStatus: 'SUCCESS',
    fiscalizationState: 'TRA_CONFIRMED_EWURA_PENDING',
    auditMessage:
      'TRA fiscalization completed; EWURA failed and remains queued for asynchronous retry.',
  }
}

function payloadObject(row: EwuraRetryRow): Record<string, any> {
  const payload = row.payload_json
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}
}

function resolveRetryEndpoint(
  row: EwuraRetryRow,
  fallbackType: EwuraPayloadType,
) {
  const payload = payloadObject(row)
  const endpoint = String(payload.endpoint ?? '').trim()
  if (endpoint) return endpoint
  return EWURA_ENDPOINTS[fallbackType]
}

function resolveRetryXml(row: EwuraRetryRow) {
  const payload = payloadObject(row)
  const xml = String(payload.xml ?? payload.requestXml ?? '').trim()
  return xml || null
}

async function processRetryRow(args: {
  table: EwuraQueueTable
  row: EwuraRetryRow
  fallbackType: EwuraPayloadType
}) {
  const cfg = await readTanzaniaFiscalConfig(args.row.station_id)
  const maxAttempts = cfg.ewura.maxRetryAttempts
  const retryBaseDelaySeconds = cfg.ewura.retryBaseDelaySeconds
  const retryMaxDelaySeconds = cfg.ewura.retryMaxDelaySeconds
  const xml = resolveRetryXml(args.row)

  if (!xml) {
    const decision = classifyEwuraFailure({
      error: 'EWURA retry row has no stored XML payload.',
      retryCount: args.row.retry_count,
      maxAttempts,
      baseDelaySeconds: retryBaseDelaySeconds,
      maxDelaySeconds: retryMaxDelaySeconds,
    })
    await markEwuraRetryScheduled({
      table: args.table,
      stationId: args.row.station_id,
      id: args.row.id,
      error: decision.reason,
      response: { reason: decision.reason, missingXml: true },
      retryable: false,
      nextAttemptAt: null,
      maxAttempts,
    })
    return {
      id: args.row.id,
      ok: false,
      retryable: false,
      error: decision.reason,
    }
  }

  if (!cfg.ewura.baseUrl) {
    const decision = classifyEwuraFailure({
      error: 'EWURA base URL is not configured in DB.',
      retryCount: args.row.retry_count,
      maxAttempts,
      baseDelaySeconds: retryBaseDelaySeconds,
      maxDelaySeconds: retryMaxDelaySeconds,
    })
    await markEwuraRetryScheduled({
      table: args.table,
      stationId: args.row.station_id,
      id: args.row.id,
      error: decision.reason,
      response: { reason: decision.reason, configMissing: 'baseUrl' },
      retryable: false,
      nextAttemptAt: null,
      maxAttempts,
    })
    return {
      id: args.row.id,
      ok: false,
      retryable: false,
      error: decision.reason,
    }
  }

  try {
    const result = await postEwuraXml({
      baseUrl: cfg.ewura.baseUrl,
      endpoint: resolveRetryEndpoint(args.row, args.fallbackType),
      xml,
    })

    if (result.ok) {
      if (args.table === 'ewura_transactions') {
        await markEwuraTransactionSent({
          stationId: args.row.station_id,
          id: args.row.id,
          reference: result.reference,
          response: {
            ...result.responsePayload,
            retried: true,
          },
        })
      } else {
        await markEwuraReportSent({
          stationId: args.row.station_id,
          id: args.row.id,
          reference: result.reference,
          response: {
            ...result.responsePayload,
            retried: true,
          },
        })
      }
      return {
        id: args.row.id,
        ok: true,
        retryable: false,
        reference: result.reference ?? null,
      }
    }

    const decision = classifyEwuraFailure({
      error: result.error,
      responsePayload: result.responsePayload,
      retryCount: args.row.retry_count,
      maxAttempts,
      baseDelaySeconds: retryBaseDelaySeconds,
      maxDelaySeconds: retryMaxDelaySeconds,
    })
    await markEwuraRetryScheduled({
      table: args.table,
      stationId: args.row.station_id,
      id: args.row.id,
      error: result.error ?? decision.reason,
      response: {
        ...result.responsePayload,
        retryDecision: decision,
      },
      retryable: decision.retryable,
      nextAttemptAt: decision.nextAttemptAt,
      maxAttempts,
    })
    return {
      id: args.row.id,
      ok: false,
      retryable: decision.retryable,
      error: result.error ?? decision.reason,
      nextAttemptAt: decision.nextAttemptAt,
    }
  } catch (e: any) {
    const error = String(e?.message || e)
    const decision = classifyEwuraFailure({
      error,
      retryCount: args.row.retry_count,
      maxAttempts,
      baseDelaySeconds: retryBaseDelaySeconds,
      maxDelaySeconds: retryMaxDelaySeconds,
    })
    await markEwuraRetryScheduled({
      table: args.table,
      stationId: args.row.station_id,
      id: args.row.id,
      error,
      response: { error, retryDecision: decision },
      retryable: decision.retryable,
      nextAttemptAt: decision.nextAttemptAt,
      maxAttempts,
    })
    return {
      id: args.row.id,
      ok: false,
      retryable: decision.retryable,
      error,
      nextAttemptAt: decision.nextAttemptAt,
    }
  }
}

export async function processReadyEwuraRetries(args: {
  stationId?: string | null
  limit?: number
}) {
  const limit = clampInt(args.limit, 10, 1, 100)
  const defaultMaxAttempts = 20
  const transactionRows = await claimReadyEwuraTransactions({
    stationId: args.stationId ?? null,
    limit,
    maxAttempts: defaultMaxAttempts,
  })
  const reportRows = await claimReadyEwuraReports({
    stationId: args.stationId ?? null,
    limit,
    maxAttempts: defaultMaxAttempts,
  })

  const transactions = []
  for (const row of transactionRows) {
    transactions.push(
      await processRetryRow({
        table: 'ewura_transactions',
        row,
        fallbackType: 'sales',
      }),
    )
  }

  const reports = []
  for (const row of reportRows) {
    reports.push(
      await processRetryRow({
        table: 'ewura_reports',
        row,
        fallbackType: 'inventory',
      }),
    )
  }

  return {
    claimed: transactionRows.length + reportRows.length,
    transactions,
    reports,
  }
}

export async function getEwuraRetryHealth(stationId: string) {
  return await readEwuraQueueHealth({ stationId })
}

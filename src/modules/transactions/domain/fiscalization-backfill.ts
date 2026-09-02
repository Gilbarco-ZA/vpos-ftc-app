import type {
  FiscalizationCompatibilitySummaryV1,
  FiscalizationEventStatus,
} from '@/src/modules/transactions/domain/fiscalization-event'

import {
  buildFiscalizationCompatibilitySummary,
  hashFiscalPayload,
  normalizeFiscalPayload,
  parseFiscalizationCompatibilitySummary,
} from '@/src/modules/transactions/domain/fiscalization-event'

export const LEGACY_FISCALIZATION_BACKFILL_VERSION = 1 as const

const SUCCESS_TRANSACTION_STATUSES = new Set([
  'FISCALIZED',
  'PRINTED',
  'REPRINTED',
  'CREDITED',
  'COMPLETED',
])

const SUCCESS_RESPONSE_STATUSES = new Set([
  'SUCCESS',
  'SUCCEEDED',
  'COMPLETED',
  'COMPLETE',
  'APPROVED',
  'ACCEPTED',
  'FISCALIZED',
  'PROCESSED',
])

const FAILED_RESPONSE_STATUSES = new Set([
  'FAILED',
  'FAILURE',
  'ERROR',
  'REJECTED',
  'DECLINED',
  'CANCELLED',
  'CANCELED',
])

const getPath = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, source)

const firstValue = (source: unknown, paths: string[]): unknown => {
  for (const path of paths) {
    const value = getPath(source, path)
    if (value !== undefined && value !== null && String(value).trim()) {
      return value
    }
  }
  return null
}

const compactString = (value: unknown, maxLength = 512): string | null => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

export type LegacyFiscalizationResponseClassification =
  | {
      kind: 'empty'
      payload: null
      payloadHash: null
      summary: null
    }
  | {
      kind: 'compatibility_summary'
      payload: null
      payloadHash: string | null
      summary: FiscalizationCompatibilitySummaryV1
    }
  | {
      kind: 'legacy_payload'
      payload: unknown
      payloadHash: string
      summary: null
    }

export function classifyLegacyFiscalizationResponse(
  value: unknown,
): LegacyFiscalizationResponseClassification {
  const summary = parseFiscalizationCompatibilitySummary(value)
  if (summary) {
    return {
      kind: 'compatibility_summary',
      payload: null,
      payloadHash: summary.payloadHash,
      summary,
    }
  }

  const payload = normalizeFiscalPayload(value)
  if (payload == null) {
    return { kind: 'empty', payload: null, payloadHash: null, summary: null }
  }

  const payloadHash = hashFiscalPayload({ responsePayload: payload })
  if (!payloadHash) {
    return { kind: 'empty', payload: null, payloadHash: null, summary: null }
  }

  return {
    kind: 'legacy_payload',
    payload,
    payloadHash,
    summary: null,
  }
}

export function deriveLegacyFiscalizationEventStatus(input: {
  transactionStatus?: string | null
  fiscalizedAt?: string | Date | null
  payload?: unknown
}): FiscalizationEventStatus {
  const explicitSuccess = firstValue(input.payload, [
    'success',
    'successful',
    'result.success',
    'response.success',
    'details.success',
  ])
  if (
    explicitSuccess === true ||
    String(explicitSuccess).toLowerCase() === 'true'
  ) {
    return 'SUCCESS'
  }
  if (
    explicitSuccess === false ||
    String(explicitSuccess).toLowerCase() === 'false'
  ) {
    return 'FAILED'
  }

  const responseStatus = compactString(
    firstValue(input.payload, [
      'status',
      'state',
      'result.status',
      'response.status',
      'details.status',
      'submission.status',
      'final.status',
    ]),
  )?.toUpperCase()

  if (responseStatus && SUCCESS_RESPONSE_STATUSES.has(responseStatus)) {
    return 'SUCCESS'
  }
  if (responseStatus && FAILED_RESPONSE_STATUSES.has(responseStatus)) {
    return 'FAILED'
  }

  const transactionStatus = compactString(
    input.transactionStatus,
  )?.toUpperCase()
  if (
    input.fiscalizedAt != null ||
    (transactionStatus && SUCCESS_TRANSACTION_STATUSES.has(transactionStatus))
  ) {
    return 'SUCCESS'
  }

  return 'FAILED'
}

export function deriveLegacyFiscalizationReference(input: {
  transactionReference?: string | null
  payload?: unknown
}): string | null {
  return (
    compactString(input.transactionReference) ||
    compactString(
      firstValue(input.payload, [
        'documentNumber',
        'document_number',
        'receiptVerificationNo',
        'receipt_verification_no',
        'receipt.receiptNumber',
        'receipt.receipt_number',
        'details.documentNumber',
        'details.document_number',
        'data.receipt.receiptNumber',
      ]),
    )
  )
}

export function deriveLegacyFiscalizationEngine(payload: unknown): string {
  return (
    compactString(
      firstValue(payload, [
        'engine',
        'fiscalizationEngine',
        'fiscalization_engine',
        'countryCode',
        'country_code',
      ]),
      32,
    ) || 'legacy'
  )
}

export function buildLegacyFiscalizationIdempotencyKey(input: {
  transactionId: string
  payloadHash: string
}): string {
  return `legacy-fiscal-response:v${LEGACY_FISCALIZATION_BACKFILL_VERSION}:${input.transactionId}:${input.payloadHash}`
}

export function buildLegacyFiscalizationSummary(input: {
  eventId: string
  status: FiscalizationEventStatus
  engine: string
  reference?: string | null
  fiscalDocumentId?: string | null
  responsePayload?: unknown
  payloadHash?: string | null
  occurredAt?: string | Date | null
}) {
  return buildFiscalizationCompatibilitySummary({
    eventId: input.eventId,
    status: input.status,
    engine: input.engine,
    transport: 'legacy',
    reference: input.reference,
    fiscalDocumentId: input.fiscalDocumentId,
    responsePayload: input.responsePayload,
    payloadHash: input.payloadHash,
    occurredAt: input.occurredAt ?? undefined,
  })
}

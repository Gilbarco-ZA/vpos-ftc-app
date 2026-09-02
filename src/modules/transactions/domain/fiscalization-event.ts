import { createHash } from 'node:crypto'

export const FISCAL_EVENT_SCHEMA_VERSION = 1 as const
export const FISCALIZATION_SUMMARY_SCHEMA_VERSION = 1 as const

export type FiscalizationEventStatus = 'PENDING' | 'SUCCESS' | 'FAILED'
export type FiscalizationTransport = 'internal' | 'proxy' | 'legacy'
export type FiscalizationEventOrigin = 'runtime' | 'legacy_import' | 'backfill'

export type FiscalizationCompatibilitySummaryV1 = {
  schemaVersion: typeof FISCALIZATION_SUMMARY_SCHEMA_VERSION
  source: 'fiscalization_event'
  eventId: string
  status: FiscalizationEventStatus
  engine: string
  transport: FiscalizationTransport
  reference: string | null
  fiscalDocumentId: string | null
  requestId: string | null
  responseStatus: string | null
  message: string | null
  payloadHash: string | null
  occurredAt: string
}

const REDACTED = '[REDACTED]'
const MAX_SUMMARY_VALUE_LENGTH = 512

const sensitiveKeyPattern =
  /(?:authorization|access[_-]?token|refresh[_-]?token|bearer|password|passwd|secret|private[_-]?key|client[_-]?secret|certificate|cert[_-]?data|pfx|pkcs12|cvv|cvc|card[_-]?number|account[_-]?number|full[_-]?pan|^pan$)/i

export const sanitizeFiscalText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(token|password|passwd|secret|api[_-]?key|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    )

const sortForStableJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortForStableJson)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortForStableJson((value as Record<string, unknown>)[key])
      return acc
    }, {})
}

export const stableJsonStringify = (value: unknown): string =>
  JSON.stringify(sortForStableJson(value))

export function sanitizeFiscalPayload(value: unknown): unknown {
  const seen = new WeakSet<object>()

  const visit = (entry: unknown, key?: string): unknown => {
    if (key && sensitiveKeyPattern.test(key)) return REDACTED
    if (entry == null) return null
    if (entry instanceof Date) return entry.toISOString()
    if (typeof entry === 'bigint') return entry.toString()
    if (typeof entry === 'string') return sanitizeFiscalText(entry)
    if (typeof entry !== 'object') return entry

    if (seen.has(entry)) return '[CIRCULAR]'
    seen.add(entry)

    if (Array.isArray(entry)) {
      return entry.map((item) => visit(item))
    }

    return Object.entries(entry as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, [childKey, childValue]) => {
      acc[childKey] = visit(childValue, childKey)
      return acc
    }, {})
  }

  return visit(value)
}

export function normalizeFiscalPayload(value: unknown): unknown {
  if (value == null) return null
  if (typeof value !== 'string') return sanitizeFiscalPayload(value)

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return sanitizeFiscalPayload(JSON.parse(trimmed))
  } catch {
    return { raw: sanitizeFiscalText(trimmed) }
  }
}

export function hashFiscalPayload(input: {
  requestPayload?: unknown
  responsePayload?: unknown
}): string | null {
  const requestPayload = normalizeFiscalPayload(input.requestPayload)
  const responsePayload = normalizeFiscalPayload(input.responsePayload)
  if (requestPayload == null && responsePayload == null) return null

  return createHash('sha256')
    .update(stableJsonStringify({ requestPayload, responsePayload }))
    .digest('hex')
}

const getPath = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, source)

const compactString = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return normalized.slice(0, MAX_SUMMARY_VALUE_LENGTH)
}

const firstPath = (source: unknown, paths: string[]): string | null => {
  for (const path of paths) {
    const value = compactString(getPath(source, path))
    if (value) return value
  }
  return null
}

export function buildFiscalizationCompatibilitySummary(input: {
  eventId: string
  status: FiscalizationEventStatus
  engine: string
  transport: FiscalizationTransport
  reference?: string | null
  fiscalDocumentId?: string | null
  responsePayload?: unknown
  payloadHash?: string | null
  occurredAt?: string | Date
}): FiscalizationCompatibilitySummaryV1 {
  const responsePayload = normalizeFiscalPayload(input.responsePayload)
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : compactString(input.occurredAt) || new Date().toISOString()

  return {
    schemaVersion: FISCALIZATION_SUMMARY_SCHEMA_VERSION,
    source: 'fiscalization_event',
    eventId: input.eventId,
    status: input.status,
    engine: compactString(input.engine) || 'unknown',
    transport: input.transport,
    reference:
      compactString(input.reference) ||
      firstPath(responsePayload, [
        'documentNumber',
        'document_number',
        'details.documentNumber',
        'details.document_number',
        'receipt.receiptNumber',
        'receipt.receipt_number',
        'data.receipt.receiptNumber',
      ]),
    fiscalDocumentId:
      compactString(input.fiscalDocumentId) ||
      firstPath(responsePayload, [
        'documentId',
        'document_id',
        'details.documentId',
        'details.document_id',
        'data.documentId',
      ]),
    requestId: firstPath(responsePayload, [
      'requestId',
      'request_id',
      'submission.requestId',
      'submission.request_id',
      'data.requestId',
      'details.requestId',
    ]),
    responseStatus: firstPath(responsePayload, [
      'status',
      'state',
      'result.status',
      'details.status',
      'response.status',
      'final.status',
      'submission.status',
    ]),
    message: compactString(
      sanitizeFiscalText(
        firstPath(responsePayload, [
          'message',
          'errorMessage',
          'error_message',
          'details.message',
          'response.message',
          'final.message',
        ]),
      ),
    ),
    payloadHash: compactString(input.payloadHash),
    occurredAt,
  }
}

export function parseFiscalizationCompatibilitySummary(
  value: unknown,
): FiscalizationCompatibilitySummaryV1 | null {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const candidate = parsed as Partial<FiscalizationCompatibilitySummaryV1>
  if (
    candidate.schemaVersion !== FISCALIZATION_SUMMARY_SCHEMA_VERSION ||
    candidate.source !== 'fiscalization_event' ||
    !compactString(candidate.eventId)
  ) {
    return null
  }

  return candidate as FiscalizationCompatibilitySummaryV1
}

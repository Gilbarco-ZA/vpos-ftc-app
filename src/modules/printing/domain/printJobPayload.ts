import { htmlToPlainText } from '@/src/shared/receipts/receiptContent'

export { htmlToPlainText }

export const CANONICAL_PRINT_JOB_TYPES = {
  receipt: 'print.receipt',
  report: 'print.report',
} as const

const RECEIPT_JOB_ALIASES = new Set([
  CANONICAL_PRINT_JOB_TYPES.receipt,
  'TRANSACTION_RECEIPT',
])
const REPORT_JOB_ALIASES = new Set([CANONICAL_PRINT_JOB_TYPES.report, 'REPORT'])

const REFERENCE_PAYLOAD_KEYS = [
  'copies',
  'copyCount',
  'correlationId',
  'deviceKey',
  'isReprint',
  'offlinePrint',
  'port',
  'printerIP',
  'printerIp',
  'printerKey',
  'printer_key',
  'receiptId',
  'receiptNumber',
  'reportId',
  'pumpNumber',
  'pump_number',
  'source',
  'timeoutMs',
  'type',
  'width',
] as const

const PRINTABLE_TEXT_KEYS = [
  'plainTextContent',
  'plain_text_content',
  'text',
  'content',
] as const

export type ReferencePrintJobPayload = Record<string, unknown> & {
  schemaVersion: 1
  storageMode: 'reference'
}

export type EmbeddedPrintable =
  | { kind: 'escposBase64'; value: string }
  | { kind: 'receiptLines'; value: unknown[] }
  | { kind: 'text'; value: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return null
}

export function normalizePrintJobType(jobType: string): string {
  const normalized = String(jobType ?? '').trim()
  if (RECEIPT_JOB_ALIASES.has(normalized)) {
    return CANONICAL_PRINT_JOB_TYPES.receipt
  }
  if (REPORT_JOB_ALIASES.has(normalized)) {
    return CANONICAL_PRINT_JOB_TYPES.report
  }
  return normalized
}

export function extractPrintPayloadSource(payload: unknown): string | null {
  const source = asRecord(payload)
  if (!source) return null

  return firstNonEmptyString(
    source.source,
    asRecord(source.data)?.source,
    asRecord(source.printable)?.source,
  )
}

export function isSpecializedEmbeddedReceiptPayload(payload: unknown): boolean {
  const source = asRecord(payload)
  if (!source || source.storageMode === 'reference') return false

  const sourceKind = extractPrintPayloadSource(payload)
  if (!sourceKind) return false

  return (
    sourceKind !== 'vpos.transaction-receipt' &&
    sourceKind !== 'vpos.auto-print-receipt'
  )
}

export function buildReferencePrintJobPayload(
  payload: unknown,
): ReferencePrintJobPayload {
  const source = asRecord(payload) ?? {}
  const data = asRecord(source.data)
  const printable = asRecord(source.printable)
  const compact: ReferencePrintJobPayload = {
    schemaVersion: 1,
    storageMode: 'reference',
  }

  for (const key of REFERENCE_PAYLOAD_KEYS) {
    const value = source[key] ?? data?.[key] ?? printable?.[key]
    if (value !== undefined && value !== null && value !== '') {
      compact[key] = value
    }
  }

  if (!compact.source) {
    const nestedSource = firstNonEmptyString(data?.source, printable?.source)
    if (nestedSource) compact.source = nestedSource
  }

  return compact
}

function collectPrintableContainers(
  payload: unknown,
): Record<string, unknown>[] {
  const root = asRecord(payload)
  if (!root) return []

  const containers: Record<string, unknown>[] = []
  const seen = new Set<Record<string, unknown>>()
  const add = (value: unknown) => {
    const record = asRecord(value)
    if (!record || seen.has(record)) return
    seen.add(record)
    containers.push(record)
  }

  add(root.data)
  add(asRecord(root.data)?.receipt)
  add(asRecord(root.data)?.report)
  add(root.receipt)
  add(root.report)
  add(root.printable)
  add(asRecord(root.printable)?.receipt)
  add(asRecord(root.printable)?.report)
  add(root)

  return containers
}

export function extractEmbeddedPrintable(
  payload: unknown,
): EmbeddedPrintable | null {
  for (const container of collectPrintableContainers(payload)) {
    const escposBase64 = firstNonEmptyString(
      container.escposBase64,
      container.escpos_base64,
    )
    if (escposBase64) return { kind: 'escposBase64', value: escposBase64 }

    if (Array.isArray(container.receiptLines)) {
      return { kind: 'receiptLines', value: container.receiptLines }
    }

    for (const key of PRINTABLE_TEXT_KEYS) {
      const text = firstNonEmptyString(container[key])
      if (text) return { kind: 'text', value: text }
    }
  }

  return null
}

export function formatReportPrintText(input: {
  reportType?: unknown
  reportDateTime?: unknown
  payload: unknown
}): string {
  const embedded = extractEmbeddedPrintable(input.payload)
  if (embedded?.kind === 'text') return embedded.value

  const reportType = firstNonEmptyString(input.reportType) ?? 'REPORT'
  const reportDateTime = firstNonEmptyString(input.reportDateTime)
  let serialized = ''

  if (typeof input.payload === 'string') {
    serialized = input.payload.trim()
  } else if (input.payload !== undefined && input.payload !== null) {
    try {
      serialized = JSON.stringify(input.payload, null, 2)
    } catch {
      serialized = String(input.payload)
    }
  }

  return [
    reportType,
    reportDateTime ? `Generated: ${reportDateTime}` : null,
    '--------------------------------',
    serialized || 'No report content available',
  ]
    .filter(Boolean)
    .join('\n')
}

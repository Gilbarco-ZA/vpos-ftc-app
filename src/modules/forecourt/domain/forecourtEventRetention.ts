import { createHash } from 'node:crypto'

export type ForecourtEventRetentionClass =
  | 'routine'
  | 'error'
  | 'maintenance_security'
  | 'field_evidence'

export const FORECOURT_EVENT_PAYLOAD_SCHEMA_VERSION = 1

const MAX_STRING_LENGTH = 512
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_KEYS = 60
const MAX_DEPTH = 6
const MAX_NODES = 600

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|api[-_]?key|private[-_]?key|certificate|client[-_]?secret|card(number|pan)?|track[12]|pin|cvv|cvc/i

const SENSITIVE_VALUE_PATTERN =
  /authorization\s*:|bearer\s+|password\s*[=:]|passwd\s*[=:]|secret\s*[=:]|token\s*[=:]|api[-_ ]?key\s*[=:]|private[-_ ]?key|begin [a-z ]*private key/i

const ERROR_MARKER_PATTERN =
  /error|failed|failure|fault|alarm|timeout|disconnect|rejected|denied|blocked|invalid/i

const FIELD_EVIDENCE_PATTERN =
  /field[_ .-]?validation|commissioning|deployment[_ .-]?sign[_ .-]?off|acceptance|evidence|fcinstallstatus|tgstatus[_ .-]?resp|tankdeliverydata[_ .-]?resp/i

const MAINTENANCE_SECURITY_PATTERN =
  /maintenance|mapping|command|authorization|security|session|replay[_ .-]?transaction[_ .-]?restored|rollback|remediation/i

const COMPACT_KEYS = [
  'requestId',
  'correlationId',
  'commandId',
  'sessionId',
  'transactionId',
  'receiptId',
  'reportId',
  'eventId',
  'fpId',
  'FpId',
  'fp_id',
  'pumpId',
  'pumpNumber',
  'TgId',
  'tgId',
  'tankId',
  'TransSeqNo',
  'transSeqNo',
  'status',
  'state',
  'FpMainState',
  'action',
  'command',
  'outcome',
  'result',
  'ok',
  'success',
  'accepted',
  'code',
  'reason',
  'message',
  'warningCount',
  'errorCount',
  'updatedCount',
  'appliedCount',
] as const

type SanitizeBudget = { remaining: number }

const stableJson = (value: unknown): string => {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  )
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`
}

export const hashForecourtEventPayload = (payload: unknown) =>
  createHash('sha256')
    .update(stableJson(payload ?? null))
    .digest('hex')

const scalar = (
  value: unknown,
): string | number | boolean | null | undefined => {
  if (value == null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE_PATTERN.test(value)) return '[redacted sensitive value]'
    return value.slice(0, MAX_STRING_LENGTH)
  }
  return undefined
}

const sanitizeEvidenceValue = (
  value: unknown,
  budget: SanitizeBudget,
  depth = 0,
): unknown => {
  if (budget.remaining <= 0) return '[truncated]'
  budget.remaining -= 1

  const compacted = scalar(value)
  if (compacted !== undefined) return compacted
  if (depth >= MAX_DEPTH) return '[max-depth]'

  if (Array.isArray(value)) {
    const retained = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeEvidenceValue(entry, budget, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      retained.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return retained
  }

  if (!value || typeof value !== 'object') return null

  const output: Record<string, unknown> = {}
  const entries = Object.entries(value as Record<string, unknown>).slice(
    0,
    MAX_OBJECT_KEYS,
  )
  for (const [key, entry] of entries) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[redacted]'
      : sanitizeEvidenceValue(entry, budget, depth + 1)
  }
  if (Object.keys(value as Record<string, unknown>).length > entries.length) {
    output.__truncatedKeys =
      Object.keys(value as Record<string, unknown>).length - entries.length
  }
  return output
}

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const readCompactValue = (
  source: Record<string, unknown>,
  key: string,
): string | number | boolean | null | undefined => {
  const direct = scalar(source[key])
  if (direct !== undefined) return direct

  for (const nestedKey of ['payload', 'data', 'result']) {
    const nested = readRecord(source[nestedKey])
    if (!nested) continue
    const value = scalar(nested[key])
    if (value !== undefined) return value
  }

  return undefined
}

const normalizePumpId = (payload: Record<string, unknown>) => {
  for (const key of ['pumpId', 'pumpNumber', 'fpId', 'FpId', 'fp_id']) {
    const value = readCompactValue(payload, key)
    if (value != null && String(value).trim()) return value
  }
  return undefined
}

const normalizeAction = (payload: Record<string, unknown>) => {
  for (const key of ['action', 'command']) {
    const value = readCompactValue(payload, key)
    if (value != null && String(value).trim()) return value
  }
  return undefined
}

const payloadSignalsError = (payload: Record<string, unknown>) => {
  const values = ['status', 'state', 'outcome', 'result', 'code', 'message']
    .map((key) => readCompactValue(payload, key))
    .filter((value) => value != null)
    .map(String)
    .join(' ')
  return ERROR_MARKER_PATTERN.test(values)
}

export function classifyForecourtEvent(input: {
  source: string
  eventType: string
  payload?: unknown
}): ForecourtEventRetentionClass {
  const source = String(input.source ?? '')
    .trim()
    .toLowerCase()
  const eventType = String(input.eventType ?? '').trim()
  const payload = readRecord(input.payload) ?? {}
  const signal = `${source} ${eventType}`

  if (FIELD_EVIDENCE_PATTERN.test(signal)) return 'field_evidence'
  if (source === 'admin' || MAINTENANCE_SECURITY_PATTERN.test(signal)) {
    return 'maintenance_security'
  }
  if (ERROR_MARKER_PATTERN.test(signal) || payloadSignalsError(payload)) {
    return 'error'
  }
  return 'routine'
}

export function compactForecourtEventPayload(input: {
  eventType: string
  payload?: unknown
  retentionClass: ForecourtEventRetentionClass
}): Record<string, unknown> {
  const payload = readRecord(input.payload) ?? {}

  if (input.retentionClass === 'field_evidence') {
    const sanitized = sanitizeEvidenceValue(payload, { remaining: MAX_NODES })
    return readRecord(sanitized) ?? { value: sanitized }
  }

  const compact: Record<string, unknown> = {
    schemaVersion: FORECOURT_EVENT_PAYLOAD_SCHEMA_VERSION,
  }
  const pumpId = normalizePumpId(payload)
  const action = normalizeAction(payload)
  if (pumpId !== undefined) compact.pumpId = pumpId
  if (action !== undefined) compact.action = action

  for (const key of COMPACT_KEYS) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    const value = readCompactValue(payload, key)
    if (value !== undefined && value !== null) compact[key] = value
  }

  compact.sourceFieldCount = Object.keys(payload).length
  return compact
}

export function prepareForecourtEventStorage(input: {
  source: string
  eventType: string
  payload?: unknown
}) {
  const retentionClass = classifyForecourtEvent(input)
  return {
    retentionClass,
    payload: compactForecourtEventPayload({
      eventType: input.eventType,
      payload: input.payload,
      retentionClass,
    }),
    payloadHash: hashForecourtEventPayload(input.payload),
    payloadSchemaVersion: FORECOURT_EVENT_PAYLOAD_SCHEMA_VERSION,
  }
}

export type RuntimeArchiveMode = 'off' | 'compact-allowlist'

export type RuntimeArchivePolicy = {
  mode: RuntimeArchiveMode
  allowlist: string[]
  retentionDays: number
  cleanupIntervalMs: number
  cleanupBatchSize: number
  cleanupMaxBatches: number
}

export type RuntimeArchiveEnvironment = Readonly<
  Record<string, string | undefined>
>

const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const DEFAULT_CLEANUP_BATCH_SIZE = 1000
const DEFAULT_CLEANUP_MAX_BATCHES = 10
const MAX_ARCHIVE_STRING_LENGTH = 512

const IDENTIFIER_KEYS = [
  'requestId',
  'correlationId',
  'transactionId',
  'receiptId',
  'reportId',
  'commandId',
  'jobId',
  'eventId',
  'fpId',
  'pumpId',
  'tankId',
  'nozzleId',
] as const

const OUTCOME_KEYS = ['status', 'outcome', 'ok', 'success', 'accepted'] as const

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (value == null || String(value).trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function parseArchiveMode(value: unknown): RuntimeArchiveMode {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'compact-allowlist'
    ? 'compact-allowlist'
    : 'off'
}

function parseAllowlist(value: unknown): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

export function getRuntimeArchivePolicy(
  env: RuntimeArchiveEnvironment = process.env,
): RuntimeArchivePolicy {
  return {
    mode: parseArchiveMode(env.VPOS_RUNTIME_ARCHIVE_MODE),
    allowlist: parseAllowlist(env.VPOS_RUNTIME_ARCHIVE_ALLOWLIST),
    retentionDays: clampInteger(
      env.VPOS_RUNTIME_ARCHIVE_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
      0,
      3650,
    ),
    cleanupIntervalMs: clampInteger(
      env.VPOS_RUNTIME_ARCHIVE_CLEANUP_INTERVAL_MS,
      DEFAULT_CLEANUP_INTERVAL_MS,
      60_000,
      7 * 24 * 60 * 60 * 1000,
    ),
    cleanupBatchSize: clampInteger(
      env.VPOS_RUNTIME_ARCHIVE_CLEANUP_BATCH_SIZE,
      DEFAULT_CLEANUP_BATCH_SIZE,
      100,
      10_000,
    ),
    cleanupMaxBatches: clampInteger(
      env.VPOS_RUNTIME_ARCHIVE_CLEANUP_MAX_BATCHES,
      DEFAULT_CLEANUP_MAX_BATCHES,
      1,
      100,
    ),
  }
}

function matchesAllowlistEntry(
  entry: string,
  topic: string,
  messageType: string,
) {
  if (entry === '*') return true

  const separatorIndex = entry.indexOf(':')
  if (separatorIndex < 0) return entry === topic

  const entryTopic = entry.slice(0, separatorIndex) || '*'
  const entryMessageType = entry.slice(separatorIndex + 1) || '*'

  return (
    (entryTopic === '*' || entryTopic === topic) &&
    (entryMessageType === '*' || entryMessageType === messageType)
  )
}

export function isRuntimeArchiveMessageAllowed(
  policy: RuntimeArchivePolicy,
  topic: unknown,
  messageType: unknown,
) {
  if (policy.mode !== 'compact-allowlist') return false
  if (policy.allowlist.length === 0) return false

  const normalizedTopic = String(topic ?? 'unknown')
    .trim()
    .toLowerCase()
  const normalizedMessageType = String(messageType ?? 'message')
    .trim()
    .toLowerCase()

  return policy.allowlist.some((entry) =>
    matchesAllowlistEntry(entry, normalizedTopic, normalizedMessageType),
  )
}

function compactPrimitive(value: unknown): string | number | boolean | null {
  if (value == null) return null
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value !== 'string') return null
  return value.slice(0, MAX_ARCHIVE_STRING_LENGTH)
}

function readCompactValue(
  message: Record<string, unknown>,
  key: string,
): string | number | boolean | null | undefined {
  if (Object.prototype.hasOwnProperty.call(message, key)) {
    const direct = compactPrimitive(message[key])
    return direct === null ? undefined : direct
  }

  const payload = message.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const nested = compactPrimitive((payload as Record<string, unknown>)[key])
  return nested === null ? undefined : nested
}

function sanitizeErrorMessage(value: string) {
  const sensitiveMarker =
    /authorization|bearer\s+|password|passwd|secret|token|api[-_ ]?key|private[-_ ]?key|begin [a-z ]*private key/i

  if (sensitiveMarker.test(value)) return '[redacted sensitive error message]'
  return value.slice(0, MAX_ARCHIVE_STRING_LENGTH)
}

function compactError(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'string') {
    return { message: sanitizeErrorMessage(value) }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return undefined

  const source = value as Record<string, unknown>
  const result: Record<string, string | number | boolean> = {}

  for (const key of ['name', 'code', 'message', 'status', 'statusCode']) {
    const compacted = compactPrimitive(source[key])
    if (compacted === null) continue
    result[key] =
      key === 'message' && typeof compacted === 'string'
        ? sanitizeErrorMessage(compacted)
        : compacted
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }

  return undefined
}

/**
 * Builds a deliberately small diagnostic envelope. Full message payloads,
 * receipt bodies, fiscal responses, DOMS frames, credentials, and tokens are
 * never copied into the runtime archive.
 */
export function buildCompactRuntimeArchivePayload(
  message: Record<string, unknown>,
  topic: string,
  messageType: string,
) {
  const identifiers: Record<string, string | number | boolean> = {}
  for (const key of IDENTIFIER_KEYS) {
    const value = readCompactValue(message, key)
    if (value !== undefined && value !== null) identifiers[key] = value
  }

  const outcome: Record<string, string | number | boolean> = {}
  for (const key of OUTCOME_KEYS) {
    const value = readCompactValue(message, key)
    if (value !== undefined && value !== null) outcome[key] = value
  }

  const emittedAt =
    normalizeTimestamp(message.at) ?? normalizeTimestamp(message.timestamp)
  const error = compactError(message.error)

  return {
    schemaVersion: 1,
    topic,
    messageType,
    ...(emittedAt ? { emittedAt } : {}),
    ...(Object.keys(identifiers).length > 0 ? { identifiers } : {}),
    ...(Object.keys(outcome).length > 0 ? { outcome } : {}),
    ...(error ? { error } : {}),
  }
}

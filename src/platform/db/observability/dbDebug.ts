import { logger } from '@/src/shared/utils/logger'

type AnyRecord = Record<string, any>

const DEFAULT_SLOW_MS = 100
const DEFAULT_ROW_PREVIEW = 0
const DEFAULT_MAX_STRING = 800
const DEFAULT_MAX_KEYS = 60

function envBool(name: string, defaultValue = false): boolean {
  const value = process.env[name]
  if (value == null) return defaultValue
  if (
    value === '1' ||
    value.toLowerCase() === 'true' ||
    value.toLowerCase() === 'yes'
  ) {
    return true
  }
  if (
    value === '0' ||
    value.toLowerCase() === 'false' ||
    value.toLowerCase() === 'no'
  ) {
    return false
  }
  return defaultValue
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) return defaultValue
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}…(${value.length - maxLength} more chars)`
}

const SENSITIVE_KEY_RE =
  /(pass(word)?|secret|token|api[_-]?key|authorization|bearer|cookie)/i

function sanitizeValue(value: any, depth = 0): any {
  if (value == null) return value
  if (typeof value === 'string') {
    return truncateString(value, DEFAULT_MAX_STRING)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`
  }

  if (depth >= 3) return '[Object]'

  if (Array.isArray(value)) {
    const max = Math.min(value.length, 50)
    const output = new Array(max)
    for (let index = 0; index < max; index += 1) {
      output[index] = sanitizeValue(value[index], depth + 1)
    }
    if (value.length > max) {
      output.push(`…(${value.length - max} more items)`)
    }
    return output
  }

  if (typeof value === 'object') {
    const output: AnyRecord = {}
    const entries = Object.entries(value)
    const max = Math.min(entries.length, DEFAULT_MAX_KEYS)

    for (let index = 0; index < max; index += 1) {
      const [key, entryValue] = entries[index]
      output[key] = SENSITIVE_KEY_RE.test(key)
        ? '[REDACTED]'
        : sanitizeValue(entryValue, depth + 1)
    }

    if (entries.length > max) {
      output.__truncated__ = `${entries.length - max} keys omitted`
    }

    return output
  }

  try {
    return String(value)
  } catch {
    return '[Unserializable]'
  }
}

export function isDbDebugEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || envBool('DB_DEBUG', false)
}

export function dbSlowMs(): number {
  return envInt('DB_SLOW_MS', DEFAULT_SLOW_MS)
}

/**
 * Stable DB debug logger used by platform Postgres adapters.
 */
export function logDbQuery(params: {
  adapter: 'postgres'
  text: string
  durationMs: number
  rowCount?: number | null
  queryError?: unknown
  values?: unknown[]
  rowsPreview?: unknown[]
}) {
  if (!isDbDebugEnabled()) return

  const onlySlow = envBool('DB_DEBUG_ONLY_SLOW', false)
  const slowMs = dbSlowMs()
  if (onlySlow && params.durationMs < slowMs) return

  const includeParams = envBool('DB_DEBUG_PARAMS', false)
  const includeRowsN = envInt('DB_DEBUG_ROWS', DEFAULT_ROW_PREVIEW)

  const payload: AnyRecord = {
    ts: new Date().toISOString(),
    adapter: params.adapter,
    durationMs: params.durationMs,
    slow: params.durationMs >= slowMs,
    rowCount: params.rowCount ?? null,
    text: truncateString(params.text, 4000),
  }

  if (includeParams && params.values) {
    payload.values = sanitizeValue(params.values)
  }
  if (includeRowsN > 0 && params.rowsPreview) {
    payload.rowsPreview = sanitizeValue(
      params.rowsPreview.slice(0, includeRowsN),
    )
  }

  if (params.queryError) {
    payload.error =
      params.queryError instanceof Error
        ? { message: params.queryError.message, stack: params.queryError.stack }
        : sanitizeValue(params.queryError)
  }

  logger.debug('[db]', payload)
}

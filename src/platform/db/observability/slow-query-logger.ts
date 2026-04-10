import { readNumberEnv } from '@/src/platform/config/env'
import { recordSlowQuery } from '@/src/platform/observability/metrics'
import { redactValue } from '@/src/platform/security/pii/redaction'
import { logger } from '@/src/shared/utils/logger'

const DEFAULT_SLOW_QUERY_MS = 400
const MAX_QUERY_TEXT_LENGTH = 500
const MAX_PARAM_COUNT = 10

const truncate = (value: string, maxLength = MAX_QUERY_TEXT_LENGTH) => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

const summarizeParams = (params?: unknown[]) => {
  if (!Array.isArray(params) || params.length === 0) return []
  return params.slice(0, MAX_PARAM_COUNT).map((value) => redactValue(value))
}

export function getSlowQueryThresholdMs() {
  return readNumberEnv('VPOS_DB_SLOW_QUERY_MS', DEFAULT_SLOW_QUERY_MS)
}

export function logSlowQuery(input: {
  adapter: 'postgres'
  text: string
  params?: unknown[]
  durationMs: number
  rowCount?: number | null
  inTransaction?: boolean
  queryError?: unknown
}) {
  const thresholdMs = getSlowQueryThresholdMs()
  if (input.durationMs < thresholdMs) return

  recordSlowQuery(input.adapter, input.durationMs)
  logger.warn('[db-slow-query]', {
    adapter: input.adapter,
    durationMs: input.durationMs,
    rowCount: input.rowCount ?? null,
    inTransaction: input.inTransaction ?? false,
    thresholdMs,
    queryText: truncate(input.text),
    params: summarizeParams(input.params),
    error: input.queryError instanceof Error ? input.queryError.message : null,
  })
}

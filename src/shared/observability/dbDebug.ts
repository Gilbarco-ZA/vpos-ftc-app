import {
  dbSlowMs as platformDbSlowMs,
  isDbDebugEnabled as platformIsDbDebugEnabled,
  logDbQuery as platformLogDbQuery,
} from '@/src/platform/db/observability/dbDebug'

/**
 * Shared observability exports the cross-cutting DB debug contract.
 * Actual DB instrumentation remains platform-owned.
 */
export function isDbDebugEnabled(): boolean {
  return platformIsDbDebugEnabled()
}

export function dbSlowMs(): number {
  return platformDbSlowMs()
}

export function logDbQuery(params: Parameters<typeof platformLogDbQuery>[0]) {
  return platformLogDbQuery(params)
}

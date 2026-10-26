import {
  normalizeFiscalPayload,
  stableJsonStringify,
} from '@/src/modules/transactions/domain/fiscalization-event'

type JsonObject = Record<string, unknown>

const asObject = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null

/**
 * A proxy can update lastStatusTime on every GET even when invoice data has
 * not changed. Ignore that polling timestamp when deciding whether to write.
 * The full latest response (including that timestamp) is kept when an actual
 * status / fiscal detail change occurs.
 */
const comparableStatus = (source: JsonObject): JsonObject =>
  Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== 'lastStatusTime'),
  )

/**
 * Replace a single latest status snapshot in an existing fiscalization event.
 * Never append one item per poll, and never overwrite the original submission.
 * A null return means no material change and therefore no database write.
 */
export function mergeChangedProxyInvoiceStatus(
  currentEvidence: unknown,
  incomingStatus: unknown,
): unknown | null {
  const incoming = asObject(normalizeFiscalPayload(incomingStatus))
  const status = typeof incoming?.status === 'string'
    ? incoming.status.trim()
    : ''
  if (!incoming || !status) return null

  const existing = asObject(normalizeFiscalPayload(currentEvidence)) ?? {}
  const previous = asObject(existing.statusLookup)
  if (
    previous &&
    stableJsonStringify(comparableStatus(previous)) ===
      stableJsonStringify(comparableStatus(incoming))
  ) {
    return null
  }

  return {
    ...existing,
    statusLookup: incoming,
  }
}

const asRecord = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null

const upper = (value: unknown) => String(value ?? '').trim().toUpperCase()

const toBoolean = (value: unknown): boolean | null => {
  if (value === true || value === false) return value
  const normalized = upper(value)
  if (['TRUE', '1', 'YES'].includes(normalized)) return true
  if (['FALSE', '0', 'NO'].includes(normalized)) return false
  return null
}

const candidateEnvelopes = (value: unknown) => {
  const root = asRecord(value)
  if (!root) return []

  return [
    root,
    asRecord(root.submission),
    asRecord(root.data),
    asRecord(root.payload),
    asRecord(root.response),
    asRecord(root.final),
  ].filter((entry): entry is Record<string, any> => Boolean(entry))
}

const OFFLINE_STATUSES = new Set([
  'OFFLINE',
  'OFFLINE_QUEUED',
  'QUEUED_OFFLINE',
])

/**
 * Identifies a cloud/proxy submission that was accepted for offline processing
 * because the revenue authority could not be reached. A merely asynchronous
 * online response is not considered offline.
 */
export function isOfflineProxySubmission(value: unknown): boolean {
  for (const envelope of candidateEnvelopes(value)) {
    const responseCode = upper(
      envelope.responseCode ?? envelope.ResponseCode ?? envelope.response_code,
    )
    if (responseCode === 'OFFLINE_SUCCESS') return true

    const status = upper(
      envelope.status ?? envelope.Status ?? envelope.state ?? envelope.State,
    )
    if (OFFLINE_STATUSES.has(status)) return true

    const details = asRecord(envelope.details)
    const isOnline = toBoolean(
      details?.isOnline ??
        details?.is_online ??
        envelope.isOnline ??
        envelope.is_online,
    )
    const isFiscalized = toBoolean(
      details?.isFiscalized ??
        details?.is_fiscalized ??
        envelope.isFiscalized ??
        envelope.is_fiscalized,
    )

    if (isOnline === false && isFiscalized !== true) return true
  }

  return false
}

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

const responseCodeOf = (envelope: Record<string, any>) =>
  upper(
    envelope.responseCode ?? envelope.ResponseCode ?? envelope.response_code,
  )

const statusOf = (envelope: Record<string, any>) =>
  upper(envelope.status ?? envelope.Status ?? envelope.state ?? envelope.State)

const onlineStateOf = (envelope: Record<string, any>) => {
  const details = asRecord(envelope.details)
  return {
    isOnline: toBoolean(
      details?.isOnline ??
        details?.is_online ??
        envelope.isOnline ??
        envelope.is_online,
    ),
    isFiscalized: toBoolean(
      details?.isFiscalized ??
        details?.is_fiscalized ??
        envelope.isFiscalized ??
        envelope.is_fiscalized,
    ),
  }
}

const FINAL_STATUSES = new Set([
  'SUCCESS',
  'COMPLETED',
  'COMPLETE',
  'DONE',
  'FISCALIZED',
  'PROCESSED',
])

const isClearlyFinalOnline = (envelope: Record<string, any>) => {
  if (responseCodeOf(envelope) === 'OFFLINE_SUCCESS') return false
  const { isOnline, isFiscalized } = onlineStateOf(envelope)
  if (isFiscalized === true && isOnline !== false) return true
  return isOnline === true && FINAL_STATUSES.has(statusOf(envelope))
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
 * online response is not considered offline. A later final online result wins
 * over an earlier offline submission preserved inside a merged response.
 */
export function isOfflineProxySubmission(value: unknown): boolean {
  const root = asRecord(value)
  if (!root) return false

  const final = asRecord(root.final)
  if (final && isClearlyFinalOnline(final)) return false
  if (isClearlyFinalOnline(root)) return false

  for (const envelope of candidateEnvelopes(root)) {
    const responseCode = responseCodeOf(envelope)
    if (responseCode === 'OFFLINE_SUCCESS') return true

    if (OFFLINE_STATUSES.has(statusOf(envelope))) return true

    const { isOnline, isFiscalized } = onlineStateOf(envelope)
    if (isOnline === false && isFiscalized !== true) return true
  }

  return false
}

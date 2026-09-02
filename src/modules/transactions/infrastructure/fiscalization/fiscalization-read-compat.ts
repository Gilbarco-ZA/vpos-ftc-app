import { parseFiscalizationCompatibilitySummary } from '@/src/modules/transactions/domain/fiscalization-event'

export type CanonicalFiscalizationPayloadSource =
  | 'event'
  | 'legacy_transaction'
  | 'none'

let legacyFallbackReadCount = 0

const parsePayload = (value: unknown): unknown => {
  if (value == null) return null
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return { raw: trimmed }
  }
}

export function resolveCanonicalFiscalizationPayload(input: {
  eventResponsePayload?: unknown
  legacyTransactionResponse?: unknown
}): {
  payload: unknown
  source: CanonicalFiscalizationPayloadSource
} {
  const eventPayload = parsePayload(input.eventResponsePayload)
  if (eventPayload != null) {
    return { payload: eventPayload, source: 'event' }
  }

  if (parseFiscalizationCompatibilitySummary(input.legacyTransactionResponse)) {
    return { payload: null, source: 'none' }
  }

  const legacyPayload = parsePayload(input.legacyTransactionResponse)
  if (legacyPayload != null) {
    legacyFallbackReadCount += 1
    return { payload: legacyPayload, source: 'legacy_transaction' }
  }

  return { payload: null, source: 'none' }
}

export function getFiscalizationLegacyFallbackReadCount(): number {
  return legacyFallbackReadCount
}

export function resetFiscalizationLegacyFallbackReadCountForTests(): void {
  legacyFallbackReadCount = 0
}

export type ForecourtPayloadClearabilityReason =
  | 'eligible'
  | 'already-cleared'
  | 'payload-missing'
  | 'not-normalized'
  | 'not-reconciled'
  | 'controller-not-cleared'
  | 'transaction-lines-missing'
  | 'active-recovery-claim'
  | 'recovery-window-open'

export type ForecourtPayloadClearabilityInput = {
  hasPayload: boolean
  payloadClearedAt?: string | Date | null
  normalizedAt?: string | Date | null
  reconciledAt?: string | Date | null
  controllerClearedAt?: string | Date | null
  lineCount: number
  hasActiveRecoveryClaim: boolean
  eligibleAfter?: string | Date | null
  now?: string | Date
}

const toTime = (value: string | Date | null | undefined): number | null => {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (value == null || value === '') return null
  const parsed = new Date(String(value)).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveForecourtPayloadClearability(
  input: ForecourtPayloadClearabilityInput,
): { eligible: boolean; reason: ForecourtPayloadClearabilityReason } {
  if (input.payloadClearedAt)
    return { eligible: false, reason: 'already-cleared' }
  if (!input.hasPayload) return { eligible: false, reason: 'payload-missing' }
  if (!input.normalizedAt) return { eligible: false, reason: 'not-normalized' }
  if (!input.reconciledAt) return { eligible: false, reason: 'not-reconciled' }
  if (!input.controllerClearedAt) {
    return { eligible: false, reason: 'controller-not-cleared' }
  }
  if (!Number.isFinite(input.lineCount) || input.lineCount < 1) {
    return { eligible: false, reason: 'transaction-lines-missing' }
  }
  if (input.hasActiveRecoveryClaim) {
    return { eligible: false, reason: 'active-recovery-claim' }
  }

  const eligibleAfter = toTime(input.eligibleAfter)
  const now = toTime(input.now ?? new Date()) ?? Date.now()
  if (eligibleAfter != null && eligibleAfter > now) {
    return { eligible: false, reason: 'recovery-window-open' }
  }

  return { eligible: true, reason: 'eligible' }
}

export type ForecourtPayloadState =
  | 'never-captured'
  | 'captured'
  | 'normalized'
  | 'reconciled'
  | 'cleared-by-policy'

export function resolveForecourtPayloadState(input: {
  hasPayload: boolean
  normalizedAt?: string | Date | null
  reconciledAt?: string | Date | null
  payloadClearedAt?: string | Date | null
}): ForecourtPayloadState {
  if (input.payloadClearedAt) return 'cleared-by-policy'
  if (input.reconciledAt) return 'reconciled'
  if (input.normalizedAt) return 'normalized'
  if (input.hasPayload) return 'captured'
  return 'never-captured'
}

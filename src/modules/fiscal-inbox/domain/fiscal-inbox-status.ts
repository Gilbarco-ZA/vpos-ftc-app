export type FiscalInboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'DEAD'

export const FISCAL_INBOX_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'DEAD',
] as const satisfies readonly FiscalInboxStatus[]

const FISCAL_INBOX_STATUS_SET = new Set<string>(FISCAL_INBOX_STATUSES)

export function normalizeFiscalInboxStatus(
  value: unknown,
): FiscalInboxStatus | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return null
  return FISCAL_INBOX_STATUS_SET.has(normalized)
    ? (normalized as FiscalInboxStatus)
    : null
}

export function isFiscalInboxStatus(
  value: unknown,
): value is FiscalInboxStatus {
  return normalizeFiscalInboxStatus(value) != null
}

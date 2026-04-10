export const TRANSACTION_STATUSES = [
  'OPEN',
  'ALLOCATED',
  'PENDING',
  'QUEUED',
  'SENT',
  'FISCALIZING',
  'FISCALIZED',
  'SUCCESS',
  'FAILED',
  'REJECTED',
  'CANCELLED',
  'PRINTED',
  'REPRINTED',
  'CREDITED',
] as const

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

const TRANSACTION_STATUS_SET = new Set<string>(TRANSACTION_STATUSES)

export function normalizeTransactionStatus(
  value: unknown,
): TransactionStatus | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return null
  return TRANSACTION_STATUS_SET.has(normalized)
    ? (normalized as TransactionStatus)
    : null
}

export function isTransactionStatus(
  value: unknown,
): value is TransactionStatus {
  return normalizeTransactionStatus(value) != null
}

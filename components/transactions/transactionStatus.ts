import type { StatusVariant } from '@/src/shared/status/ui'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

/**
 * Centralized transaction status semantics.
 * Single source of truth for:
 *  - Human-readable labels
 *  - Badge variant mapping
 *
 */

export type { TransactionStatus } from '@/src/shared/types/transactions'

/**
 * Returns the UI badge variant for a given transaction status.
 */
export function transactionStatusVariant(
  status?: string | null,
): StatusVariant {
  if (!status) return STATUS_VARIANT.NEUTRAL

  switch (status.toUpperCase()) {
    case 'SUCCESS':
    case 'FISCALIZED':
      return STATUS_VARIANT.SUCCESS

    case 'OPEN':
    case 'ALLOCATED':
    case 'PENDING':
    case 'QUEUED':
    case 'SENT':
      return STATUS_VARIANT.WARN

    case 'FAILED':
    case 'REJECTED':
      return STATUS_VARIANT.ERROR

    case 'CANCELLED':
      return STATUS_VARIANT.NEUTRAL

    case 'CREDITED':
      return STATUS_VARIANT.INFO

    default:
      return STATUS_VARIANT.INFO
  }
}

/**
 * Returns a human-friendly label for a transaction status.
 */
export function transactionStatusLabel(status?: string | null): string {
  if (!status) return 'Unknown'

  switch (status.toUpperCase()) {
    case 'OPEN':
      return 'Open'

    case 'ALLOCATED':
      return 'Allocated'

    case 'PENDING':
      return 'Pending'

    case 'QUEUED':
      return 'Queued'

    case 'SENT':
      return 'Sent to Fiscal Device'

    case 'SUCCESS':
      return 'Success'

    case 'FISCALIZED':
      return 'Fiscalized'

    case 'FAILED':
      return 'Failed'

    case 'REJECTED':
      return 'Rejected'

    case 'CANCELLED':
      return 'Cancelled'

    case 'CREDITED':
      return 'Credited'

    default:
      // Fallback: Title-case unknown statuses
      return status
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

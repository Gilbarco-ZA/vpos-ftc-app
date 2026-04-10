import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { markTransactionReceiptPrintedRepo } from '@/src/modules/transactions/infrastructure/persistence/transaction.repository'

export async function markTransactionReceiptPrinted(input: {
  stationId: string
  transactionId: string
  receiptId: string
  userId?: string | null
  isReprint?: boolean
  ipAddress?: string
}) {
  return await markTransactionReceiptPrintedRepo({
    stationId: requireNonEmptyString(input.stationId, 'stationId'),
    transactionId: requireNonEmptyString(input.transactionId, 'transactionId'),
    receiptId: requireNonEmptyString(input.receiptId, 'receiptId'),
    userId: input.userId ?? null,
    isReprint: input.isReprint ?? false,
    ipAddress: input.ipAddress,
  })
}

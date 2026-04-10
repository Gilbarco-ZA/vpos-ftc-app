import type { TransactionStatus } from '@/src/modules/transactions/domain/transaction-status'

export class TransactionStatusTransitionError extends Error {
  readonly code = 'TRANSACTION_STATUS_TRANSITION_NOT_ALLOWED'

  constructor(
    public readonly currentStatus: TransactionStatus | null,
    public readonly nextStatus: TransactionStatus,
    message?: string,
  ) {
    super(
      message ||
        `Transaction status transition ${currentStatus ?? 'UNKNOWN'} -> ${nextStatus} is not allowed`,
    )
    this.name = 'TransactionStatusTransitionError'
  }
}

export class TransactionStatusNotFoundError extends Error {
  readonly code = 'TRANSACTION_NOT_FOUND'

  constructor(public readonly transactionId: string) {
    super(`Transaction ${transactionId} was not found`)
    this.name = 'TransactionStatusNotFoundError'
  }
}

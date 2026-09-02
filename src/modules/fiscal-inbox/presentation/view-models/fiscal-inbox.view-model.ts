import type { FiscalInboxDetailRow } from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

export type FiscalInboxListRowViewModel = {
  id: number
  stationId: string
  topic: string
  status: string
  requestId: string | null
  attemptCount: number
  nextAttemptAt: string | null
  createdAt: string | null
  processedAt: string | null
  deadAt: string | null
  resolvedAt: string | null
  errorText: string | null
  relatedTransactionId: string | null
  relatedTransactionStatus: string | null
}

export type FiscalInboxItemViewModel = {
  id: number
  stationId: string
  topic: string | null
  status: string | null
  requestId: string | null
  attemptCount: number
  nextAttemptAt: string | null
  receivedAt: string | null
  processedAt: string | null
  deadAt: string | null
  resolvedAt: string | null
  errorText: string | null
  relatedTransactionId: string | null
  relatedTransactionStatus: string | null
  message: unknown
}

export type FiscalInboxDetailViewModel = FiscalInboxDetailRow

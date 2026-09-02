import type { FiscalInboxStatus } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-status'

export type FiscalInboxTopic = 'fiscal' | 'pos' | 'external_fiscalization'

export type FiscalInboxListFilters = {
  stationId: string
  status?: FiscalInboxStatus | 'ANY'
  topic?: FiscalInboxTopic | 'ANY'
  limit?: number
  offset?: number
}

export type FiscalInboxListItem = {
  id: number
  stationId: string
  topic: FiscalInboxTopic
  status: FiscalInboxStatus
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

export type FiscalInboxListResult = {
  total: number
  limit: number
  offset: number
  items: FiscalInboxListItem[]
}

export type FiscalInboxDetailRow = {
  id: number
  station_id: string
  topic: FiscalInboxTopic
  request_id: string | null
  status: string
  attempt_count: number
  next_attempt_at: unknown
  received_at: unknown
  processed_at: unknown
  dead_at: unknown
  resolved_at: unknown
  error_text: string | null
  message_json: unknown
  related_transaction_id: string | null
  related_transaction_status: string | null
}

export type FiscalInboxStatusSnapshot = {
  id: number
  stationId: string
  status: FiscalInboxStatus | null
  requestId: string | null
}

export type FiscalInboxQueueRow = {
  id: number
  station_id: string
  topic: FiscalInboxTopic
  request_id: string | null
  message_json: unknown
  attempt_count: number
}

export type FiscalInboxMetrics = {
  ready: number
  processing: number
  dead: number
  oldestReadyAt: string | null
  oldestDeadAt: string | null
}

export type BulkManageFiscalInboxAction =
  | 'REQUEUE'
  | 'MARK_FAILED'
  | 'MARK_DEAD'
  | 'MARK_PROCESSED'
  | 'DELETE'

export interface FiscalInboxRepositoryPort {
  list(filters: FiscalInboxListFilters): Promise<FiscalInboxListResult>
  getById(id: number, stationId: string): Promise<FiscalInboxDetailRow | null>
  findByRequestId(
    requestId: string,
    stationId?: string | null,
  ): Promise<Record<string, unknown>[]>
  getNewestByRequestId(
    requestId: string,
    stationId?: string | null,
  ): Promise<Record<string, unknown> | null>
  getStatusSnapshot(input: {
    id: number
    stationId: string
  }): Promise<FiscalInboxStatusSnapshot | null>
  requeueById(input: { id: number; stationId: string }): Promise<number | null>
  markFailedById(input: {
    id: number
    stationId: string
    errorText: string
  }): Promise<number | null>
  markDeadById(input: {
    id: number
    stationId: string
    errorText: string
  }): Promise<number | null>
  markProcessedById(input: {
    id: number
    stationId: string
  }): Promise<number | null>
  deleteById(input: { id: number; stationId: string }): Promise<number | null>
  cloneAndRequeue(input: {
    id: number
    stationId: string
    requestId?: string | null
    messageJson?: unknown
  }): Promise<number | null>
  exportRows(
    ids: number[],
    stationId?: string | null,
  ): Promise<Record<string, unknown>[]>
  exportRowsMetadata(
    ids: number[],
    stationId?: string | null,
  ): Promise<Record<string, unknown>[]>
  bulkUpdate(input: {
    ids: number[]
    stationId?: string | null
    action: BulkManageFiscalInboxAction
    errorText?: string | null
  }): Promise<{ ok: true }>
  bulkCloneAndRequeue(input: {
    ids: number[]
    stationId?: string | null
    requestIdSuffix?: string
    override?: {
      merge?: Record<string, unknown>
      replace?: Record<string, unknown>
    }
  }): Promise<{ createdCount: number; created: Record<string, unknown>[] }>
  requeueDead(input: {
    stationId: string
    ids?: number[] | null
  }): Promise<{ requeuedCount: number; requeuedIds: number[] }>
  enqueue(input: {
    stationId: string
    topic: FiscalInboxTopic
    requestId?: string | null
    message: unknown
  }): Promise<number | null>
  claimBatch(limit: number): Promise<FiscalInboxQueueRow[]>
  markDeliveryFailed(input: {
    id: number
    errorText: string
    maxAttempts?: number
  }): Promise<void>
  getMetricsByStation(stationId: string): Promise<FiscalInboxMetrics | null>
}

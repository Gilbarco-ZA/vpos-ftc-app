import type {
  FiscalInboxDetailRow,
  FiscalInboxListItem,
} from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

export type {
  FiscalInboxDetailRow,
  FiscalInboxListItem,
} from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

export type FiscalInboxRow = {
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

export function mapFiscalInboxListItem(row: any): FiscalInboxListItem {
  return {
    id: Number(row.id),
    stationId: String(row.station_id),
    topic: row.topic,
    status: row.status,
    requestId: row.request_id ? String(row.request_id) : null,
    attemptCount: Number(row.attempt_count ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : null,
    receivedAt: row.received_at ? String(row.received_at) : null,
    processedAt: row.processed_at ? String(row.processed_at) : null,
    deadAt: row.dead_at ? String(row.dead_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    errorText: row.error_text ? String(row.error_text) : null,
    relatedTransactionId: row.related_transaction_id
      ? String(row.related_transaction_id)
      : null,
    relatedTransactionStatus: row.related_transaction_status
      ? String(row.related_transaction_status)
      : null,
    message: row.message_json ?? null,
  }
}

export function normalizeFiscalInboxRows(items: any[]): FiscalInboxRow[] {
  return items.map((item: any) => ({
    id: Number(item?.id ?? 0),
    stationId: String(item?.stationId ?? item?.station_id ?? ''),
    topic: String(item?.topic ?? ''),
    status: String(item?.status ?? ''),
    requestId: item?.requestId ?? item?.request_id ?? null,
    attemptCount: Number(item?.attemptCount ?? item?.attempt_count ?? 0),
    nextAttemptAt: item?.nextAttemptAt ?? item?.next_attempt_at ?? null,
    createdAt:
      item?.createdAt ??
      item?.receivedAt ??
      item?.created_at ??
      item?.received_at ??
      null,
    processedAt: item?.processedAt ?? item?.processed_at ?? null,
    deadAt: item?.deadAt ?? item?.dead_at ?? null,
    resolvedAt: item?.resolvedAt ?? item?.resolved_at ?? null,
    errorText: item?.errorText ?? item?.error_text ?? null,
    relatedTransactionId:
      item?.relatedTransactionId ?? item?.related_transaction_id ?? null,
    relatedTransactionStatus:
      item?.relatedTransactionStatus ??
      item?.related_transaction_status ??
      null,
  }))
}

export function normalizeFiscalInboxItem(row: any) {
  if (!row) return null
  return {
    id: Number(row.id),
    stationId:
      row.station_id != null
        ? String(row.station_id)
        : String(row.stationId ?? ''),
    topic: row.topic ?? null,
    status: row.status ?? null,
    requestId:
      row.request_id != null
        ? String(row.request_id)
        : row.requestId
          ? String(row.requestId)
          : null,
    attemptCount:
      row.attempt_count != null
        ? Number(row.attempt_count ?? 0)
        : Number(row.attemptCount ?? 0),
    nextAttemptAt:
      row.next_attempt_at != null
        ? String(row.next_attempt_at)
        : row.nextAttemptAt != null
          ? String(row.nextAttemptAt)
          : null,
    receivedAt:
      row.received_at != null
        ? String(row.received_at)
        : row.receivedAt != null
          ? String(row.receivedAt)
          : null,
    processedAt:
      row.processed_at != null
        ? String(row.processed_at)
        : row.processedAt != null
          ? String(row.processedAt)
          : null,
    deadAt:
      row.dead_at != null
        ? String(row.dead_at)
        : row.deadAt != null
          ? String(row.deadAt)
          : null,
    resolvedAt:
      row.resolved_at != null
        ? String(row.resolved_at)
        : row.resolvedAt != null
          ? String(row.resolvedAt)
          : null,
    errorText:
      row.error_text != null
        ? String(row.error_text)
        : row.errorText != null
          ? String(row.errorText)
          : null,
    relatedTransactionId:
      row.related_transaction_id != null
        ? String(row.related_transaction_id)
        : row.relatedTransactionId != null
          ? String(row.relatedTransactionId)
          : null,
    relatedTransactionStatus:
      row.related_transaction_status != null
        ? String(row.related_transaction_status)
        : row.relatedTransactionStatus != null
          ? String(row.relatedTransactionStatus)
          : null,
    message:
      row.message_json !== undefined
        ? row.message_json
        : row.message !== undefined
          ? row.message
          : null,
  }
}

export function extractTransactionId(
  row: Pick<FiscalInboxDetailRow, 'message_json' | 'request_id'>,
): string | null {
  return (
    (row.message_json && typeof row.message_json === 'object'
      ? (row.message_json as any).transactionId
      : null) || (row.request_id ? String(row.request_id) : null)
  )
}

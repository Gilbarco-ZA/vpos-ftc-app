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
    errorText:
      row.error_text != null
        ? String(row.error_text)
        : row.errorText != null
          ? String(row.errorText)
          : null,
    message:
      row.message_json !== undefined
        ? row.message_json
        : row.message !== undefined
          ? row.message
          : null,
  }
}

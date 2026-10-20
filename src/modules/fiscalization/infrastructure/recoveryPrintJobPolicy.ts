export interface ExistingRecoveryPrintJob {
  idempotency_key: string
  source_transaction_id: string
  job_type: string
  payload: unknown
}

export function matchesRecoveryPrintJob(
  job: ExistingRecoveryPrintJob | null,
  expected: {
    transactionId: string
    receiptId: string
    receiptNumber: string
    idempotencyKey: string
  },
): boolean {
  if (!job || job.idempotency_key !== expected.idempotencyKey ||
    job.source_transaction_id !== expected.transactionId ||
    job.job_type !== 'print.receipt') return false
  let payload = job.payload
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) } catch { return false }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const fields = payload as Record<string, unknown>
  return fields.storageMode === 'reference' &&
    fields.receiptId === expected.receiptId &&
    fields.receiptNumber === expected.receiptNumber &&
    fields.source === 'vpos.auto-print-receipt'
}

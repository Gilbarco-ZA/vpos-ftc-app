/**
 * SQL design artifact only. No database client is imported or invoked here.
 * 1040_transactions_reporting_and_inventory.sql defines uppercase status and
 * fiscal_document_id, but no transaction version column.
 *
 * A future adapter must execute the guarded UPDATE and audit insert in one
 * transaction. The UPDATE is the atomic compare-and-set; do not re-use the
 * in-memory version-token persistence port without adapting its contract.
 */
export interface RecoverySqlPlan {
  readonly sql: string
  readonly params: readonly [string, string, string]
}

export function buildRecoveryStatusTransitionSql(input: {
  stationId: string
  transactionId: string
  documentId: string
}): RecoverySqlPlan {
  const stationId = input.stationId.trim()
  const transactionId = input.transactionId.trim()
  const documentId = input.documentId.trim()
  if (!stationId || !transactionId || !documentId) {
    throw new Error('Station, transaction and document IDs are required')
  }
  return {
    sql: `UPDATE transactions
SET status = 'FISCALIZED',
    fiscalized_at = NOW(),
    updated_at = NOW(),
    last_error = NULL
WHERE station_id = $1::uuid
  AND id = $2::uuid
  AND fiscal_document_id = $3
  AND status = 'FISCALIZING'
  AND deleted_at IS NULL
RETURNING id, station_id, fiscal_document_id, status`,
    params: [stationId, transactionId, documentId],
  }
}

/**
 * Advisory operation-specific idempotency key to be used with existing
 * fiscalization_events unique (station_id, idempotency_key) index.
 */
export function recoveryAuditIdempotencyKey(transactionId: string, documentId: string): string {
  if (!transactionId.trim() || !documentId.trim()) throw new Error('Recovery identifiers required')
  return 'fiscal-status-recovery:' + transactionId.trim() + ':' + documentId.trim()
}

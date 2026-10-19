import { buildRecoveryStatusTransitionSql, recoveryAuditIdempotencyKey } from './recoverySqlPlan'

export interface RecoveryTransactionClient {
  query(sql: string, params: readonly unknown[]): Promise<{ rows: { id: string }[] }>
  /**
   * Must write a fiscalization_events SUCCESS event and compatibility summary
   * using the same database transaction. Throwing rolls back the status update.
   */
  recordRecoveryAudit(input: {
    stationId: string
    transactionId: string
    documentId: string
    idempotencyKey: string
    observedStatus: string
  }): Promise<void>
}

export interface RecoveryTransactionBoundary {
  transaction<T>(run: (client: RecoveryTransactionClient) => Promise<T>): Promise<T>
}

export type TransactionalRecoveryOutcome = 'applied' | 'stale'

/**
 * Isolated SQL-backed recovery adapter with injected transaction boundary.
 * Caller must first obtain a correlated confirmed assessment. This function
 * does not fetch status, issue invoices, print, or access production databases.
 */
export async function confirmTransactionFiscalizedAtomically(
  boundary: RecoveryTransactionBoundary,
  input: {
    stationId: string
    transactionId: string
    documentId: string
    observedStatus: string
    confirmed: true
  },
): Promise<TransactionalRecoveryOutcome> {
  const plan = buildRecoveryStatusTransitionSql(input)
  if (input.confirmed !== true || !input.observedStatus.trim()) {
    throw new Error('Confirmed fiscal status evidence is required')
  }
  return boundary.transaction(async client => {
    const result = await client.query(plan.sql, plan.params)
    if (result.rows.length !== 1) return 'stale'
    await client.recordRecoveryAudit({
      stationId: input.stationId.trim(),
      transactionId: input.transactionId.trim(),
      documentId: input.documentId.trim(),
      observedStatus: input.observedStatus.trim(),
      idempotencyKey: recoveryAuditIdempotencyKey(input.transactionId, input.documentId),
    })
    return 'applied'
  })
}

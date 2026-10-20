import type { FiscalRecoveryAssessment } from '../application/statusRecoveryService'
import { buildRecoveryStatusTransitionSql, recoveryAuditIdempotencyKey } from './recoverySqlPlan'

export interface RecoveryTransactionClient {
  query(sql: string, params: readonly unknown[]): Promise<{ rows: { id: string; station_id: string; fiscal_document_id: string; status: string }[] }>
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
    assessment: FiscalRecoveryAssessment
  },
): Promise<TransactionalRecoveryOutcome> {
  const assessment = input.assessment
  const decision = assessment.decision
  if (assessment.outcome !== 'confirmed' || assessment.canMarkFiscalized !== true ||
    !decision || decision.canMarkFiscalized !== true ||
    decision.resolution.state !== 'fiscalized' ||
    decision.resolution.documentId !== input.documentId ||
    decision.transactionDocumentId !== input.documentId ||
    decision.countryCode !== assessment.countryCode ||
    assessment.documentId !== input.documentId ||
    assessment.stationId !== input.stationId ||
    !decision.resolution.sourceStatus?.trim()) {
    throw new Error('Correlated fiscal status confirmation is required')
  }
  const observedStatus = decision.resolution.sourceStatus
  if (!observedStatus?.trim()) throw new Error('Correlated fiscal status confirmation is required')
  const plan = buildRecoveryStatusTransitionSql(input)
  return boundary.transaction(async client => {
    const result = await client.query(plan.sql, plan.params)
    if (result.rows.length === 0) return 'stale'
    if (result.rows.length !== 1 || result.rows[0]?.id !== input.transactionId.trim() ||
      result.rows[0]?.station_id !== input.stationId.trim() ||
      result.rows[0]?.fiscal_document_id !== input.documentId.trim() ||
      result.rows[0]?.status !== 'FISCALIZED') {
      throw new Error('Recovery update returned an unexpected transaction identity')
    }
    await client.recordRecoveryAudit({
      stationId: input.stationId.trim(),
      transactionId: input.transactionId.trim(),
      documentId: input.documentId.trim(),
      observedStatus: observedStatus.trim(),
      idempotencyKey: recoveryAuditIdempotencyKey(input.transactionId, input.documentId),
    })
    return 'applied'
  })
}

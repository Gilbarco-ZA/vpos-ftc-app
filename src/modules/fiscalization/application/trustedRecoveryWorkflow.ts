import type { FiscalStatusLookupPort, FiscalRecoveryAssessment } from './statusRecoveryService'
import { assessFiscalStatusRecovery } from './statusRecoveryService'
import type { RecoveryTransactionBoundary, TransactionalRecoveryOutcome } from '../infrastructure/transactionalRecoveryAdapter'
import { confirmTransactionFiscalizedAtomically } from '../infrastructure/transactionalRecoveryAdapter'

export type TrustedRecoveryOutcome =
  | { outcome: 'applied' | 'stale'; assessment: FiscalRecoveryAssessment }
  | { outcome: 'unresolved'; assessment: FiscalRecoveryAssessment }

/**
 * Opt-in end-to-end coordinator. Confirmation evidence is created by the
 * injected status lookup, not supplied as a caller-controlled boolean.
 * The transaction boundary still needs a real PostgreSQL implementation.
 */
export async function reconcileAndConfirmFiscalTransaction(
  lookup: FiscalStatusLookupPort,
  boundary: RecoveryTransactionBoundary,
  input: { country: unknown; stationId: string; transactionId: string; documentId: string },
): Promise<TrustedRecoveryOutcome> {
  const transactionId = input.transactionId.trim()
  if (!transactionId) throw new Error('Transaction ID is required')
  const assessment = await assessFiscalStatusRecovery(lookup, input)
  if (assessment.outcome !== 'confirmed' || !assessment.canMarkFiscalized) {
    return { outcome: 'unresolved', assessment }
  }
  const outcome: TransactionalRecoveryOutcome = await confirmTransactionFiscalizedAtomically(boundary, {
    stationId: assessment.stationId,
    documentId: assessment.documentId,
    transactionId,
    assessment,
  })
  return { outcome, assessment }
}

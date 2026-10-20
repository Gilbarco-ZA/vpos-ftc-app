import type { FiscalRecoveryAssessment } from '../application/statusRecoveryService'
import type { RecoveryTransactionClient } from './transactionalRecoveryAdapter'
import { confirmTransactionFiscalizedAtomically } from './transactionalRecoveryAdapter'
import type { RecoveryReceiptPrintTransaction } from './transactionalRecoveryReceiptPrint'
import { completeVerifiedRecoveredReceipt } from '../application/verifiedRecoveryReceiptCompletion'

export interface UnifiedRecoveryClient extends RecoveryReceiptPrintTransaction {
  recovery: RecoveryTransactionClient
  linkedEventId(input: { stationId: string; transactionId: string; documentId: string }): Promise<string | null>
}

export interface UnifiedRecoveryBoundary {
  transaction<T>(run: (client: UnifiedRecoveryClient) => Promise<T>): Promise<T>
}

export type UnifiedRecoveryOutcome =
  | { outcome: 'applied' }
  | { outcome: 'stale' }
  | { outcome: 'blocked'; blockers: readonly string[] }

class IncompleteRecovery extends Error {
  constructor(readonly blockers: readonly string[]) {
    super('Recovery completion prerequisites not met')
  }
}

/**
 * Single-transaction composition of guarded status update, audit, persisted
 * receipt verification and optional auto-print. An incomplete completion
 * throws inside the boundary so the status update and event also roll back.
 * This is opt-in only: no worker or endpoint invokes this coordinator.
 */
export async function completeFiscalRecoveryAtomically(
  boundary: UnifiedRecoveryBoundary,
  input: {
    stationId: string
    transactionId: string
    documentId: string
    assessment: FiscalRecoveryAssessment
  },
): Promise<UnifiedRecoveryOutcome> {
  try {
    return await boundary.transaction(async client => {
      const transition = await confirmTransactionFiscalizedAtomically(
        { transaction: async run => run(client.recovery) },
        input,
      )
      if (transition === 'stale') return { outcome: 'stale' as const }
      const eventId = await client.linkedEventId({
        stationId: input.stationId,
        transactionId: input.transactionId,
        documentId: input.documentId,
      })
      if (!eventId?.trim()) throw new IncompleteRecovery(['Linked fiscal event identity unavailable'])
      const completion = await completeVerifiedRecoveredReceipt(
        client.receiptRead,
        client.printing,
        {
          stationId: input.stationId,
          transactionId: input.transactionId,
          documentId: input.documentId,
          fiscalEventId: eventId,
          countryCode: input.assessment.countryCode,
          statusEvidence: input.assessment.fiscalEvidence,
        },
      )
      if (!completion.ready) throw new IncompleteRecovery(completion.blockers)
      return { outcome: 'applied' as const }
    })
  } catch (error) {
    if (error instanceof IncompleteRecovery) {
      return { outcome: 'blocked', blockers: error.blockers }
    }
    throw error
  }
}

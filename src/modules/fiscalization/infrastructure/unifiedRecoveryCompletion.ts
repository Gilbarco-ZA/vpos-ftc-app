import type { CompleteRecoveryReceiptCandidate } from './postgresRecoveryReceiptInsert'
import type { FiscalRecoveryAssessment } from '../application/statusRecoveryService'
import type { RecoveryTransactionClient } from './transactionalRecoveryAdapter'
import { confirmTransactionFiscalizedAtomically } from './transactionalRecoveryAdapter'
import type { RecoveryReceiptPrintTransaction } from './transactionalRecoveryReceiptPrint'
import { completeVerifiedRecoveredReceipt } from '../application/verifiedRecoveryReceiptCompletion'

export interface UnifiedRecoveryClient extends RecoveryReceiptPrintTransaction {
  recovery: RecoveryTransactionClient
  insertMissingReceipt?: (input: { stationId: string; transactionId: string; documentId: string; fiscalEventId: string; countryCode: FiscalRecoveryAssessment['countryCode'] }, candidate: CompleteRecoveryReceiptCandidate) => Promise<{ kind: 'created'; receiptId: string } | { kind: 'blocked'; reason: string }>
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
    receiptCandidate?: CompleteRecoveryReceiptCandidate
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
      // Never replace an existing receipt. The PostgreSQL inserter independently
      // validates persisted transaction/event provenance before writing.
      const currentReceipt = await client.receiptRead.find({
        stationId: input.stationId,
        transactionId: input.transactionId,
      })
      if (!currentReceipt && input.receiptCandidate) {
        if (!client.insertMissingReceipt) {
          throw new IncompleteRecovery(['Transactional receipt insertion unavailable'])
        }
        const inserted = await client.insertMissingReceipt({
          stationId: input.stationId,
          transactionId: input.transactionId,
          documentId: input.documentId,
          fiscalEventId: eventId,
          countryCode: input.assessment.countryCode,
        }, input.receiptCandidate)
        if (inserted.kind === 'blocked') throw new IncompleteRecovery([inserted.reason])
        const persistedReceipt = await client.receiptRead.find({
          stationId: input.stationId,
          transactionId: input.transactionId,
        })
        if (!inserted.receiptId.trim() || persistedReceipt?.id !== inserted.receiptId) {
          throw new IncompleteRecovery(['New receipt identity cannot be verified after insertion'])
        }
      }
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

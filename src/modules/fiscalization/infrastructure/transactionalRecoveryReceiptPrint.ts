import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoiceStatusFiscalEvidence } from '../application/invoiceStatusFiscalEvidence'
import type { RecoveryReceiptReadPort } from './recoveryReceiptVerification'
import type { VerifiedRecoveryPrintPort } from '../application/verifiedRecoveryReceiptCompletion'
import { completeVerifiedRecoveredReceipt } from '../application/verifiedRecoveryReceiptCompletion'

export interface RecoveryReceiptPrintTransaction {
  receiptRead: RecoveryReceiptReadPort
  printing: VerifiedRecoveryPrintPort
}

export interface RecoveryReceiptPrintBoundary {
  transaction<T>(run: (ports: RecoveryReceiptPrintTransaction) => Promise<T>): Promise<T>
}

export interface RecoveryReceiptPrintInput {
  stationId: string
  transactionId: string
  documentId: string
  fiscalEventId: string
  countryCode: FiscalCountryCode
  statusEvidence?: InvoiceStatusFiscalEvidence
}

export type RecoveryReceiptPrintOutcome =
  | { outcome: 'ready' }
  | { outcome: 'blocked'; blockers: readonly string[] }

/**
 * Opt-in transactional receipt/print completion. A blocked result throws
 * inside the boundary to guarantee rollback of any print job attempted.
 * No fiscal status updates, receipt generation, or invoice resubmission.
 */
export async function completeRecoveryReceiptPrintAtomically(
  boundary: RecoveryReceiptPrintBoundary,
  input: RecoveryReceiptPrintInput,
): Promise<RecoveryReceiptPrintOutcome> {
  if (!input.stationId.trim() || !input.transactionId.trim() ||
    !input.documentId.trim() || !input.fiscalEventId.trim()) {
    throw new Error('Recovery receipt completion identifiers required')
  }
  class BlockedCompletion extends Error {
    constructor(readonly blockers: readonly string[]) {
      super('Recovered receipt is not ready')
    }
  }
  try {
    return await boundary.transaction(async ports => {
      const result = await completeVerifiedRecoveredReceipt(
        ports.receiptRead, ports.printing, input,
      )
      if (!result.ready) throw new BlockedCompletion(result.blockers)
      return { outcome: 'ready' as const }
    })
  } catch (error) {
    if (error instanceof BlockedCompletion) {
      return { outcome: 'blocked', blockers: error.blockers }
    }
    throw error
  }
}

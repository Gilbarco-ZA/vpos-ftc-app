import type { RecoveryReceiptRow } from './recoveryReceiptVerification'
import { verifyRecoveryReceiptRow } from './recoveryReceiptVerification'
import type { FiscalCountryCode } from '../domain/countryAdapter'

export interface RecoveryReceiptCreationCandidate {
  receiptNumber: string
  fiscalData: unknown
  transactionDocumentId: string
  fiscalEventId: string
  fiscalReference: string
}

/**
 * Gate for a receipt created from authoritative, transaction-visible fiscal
 * evidence. A status response or a guessed document/reference alone cannot
 * supply the full receipt snapshot. This function performs no writes.
 */
export function assessRecoveryReceiptCreation(
  candidate: RecoveryReceiptCreationCandidate | null,
  input: { documentId: string; fiscalEventId: string; countryCode: FiscalCountryCode },
): { allowed: boolean; reason: string } {
  if (!candidate) return { allowed: false, reason: 'Authoritative receipt candidate unavailable' }
  if (!candidate.receiptNumber?.trim() || !candidate.fiscalReference?.trim() ||
    candidate.transactionDocumentId !== input.documentId ||
    candidate.fiscalEventId !== input.fiscalEventId) {
    return { allowed: false, reason: 'Receipt candidate lacks correlated fiscal identity' }
  }
  const row: RecoveryReceiptRow = {
    id: 'candidate',
    receipt_number: candidate.receiptNumber,
    fiscal_data: candidate.fiscalData,
    transaction_document_id: candidate.transactionDocumentId,
    latest_fiscal_event_id: candidate.fiscalEventId,
    fiscalization_reference: candidate.fiscalReference,
    event_id: candidate.fiscalEventId,
    event_status: 'SUCCESS',
    event_reference: candidate.fiscalReference,
  }
  const verified = verifyRecoveryReceiptRow(row, input)
  return { allowed: verified.verified, reason: verified.reason }
}

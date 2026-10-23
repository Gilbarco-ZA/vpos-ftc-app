import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoiceStatusFiscalEvidence } from './invoiceStatusFiscalEvidence'

export type RecoveryReferenceDecision =
  | { kind: 'verified'; reference: string; source: 'existing-transaction-and-event' }
  | { kind: 'unresolved'; reason: string }

/**
 * A status lookup confirms state, not the semantic meaning of a fiscal
 * reference. Never infer a receipt reference from fiscalId, fiscalCode,
 * verification code, QR data or revenue-authority fields.
 *
 * Existing transaction and SUCCESS-event references must agree. Receipt
 * snapshot correlation is verified separately before printing.
 */
export function reconcileRecoveryFiscalReference(input: {
  countryCode: FiscalCountryCode
  documentId: string
  transactionDocumentId: string | null
  transactionReference: string | null
  eventReference: string | null
  eventStatus: string | null
  statusEvidence: InvoiceStatusFiscalEvidence | undefined
}): RecoveryReferenceDecision {
  if (input.countryCode !== 'KE' && input.countryCode !== 'TZ') {
    return { kind: 'unresolved', reason: 'Unsupported fiscal reference country' }
  }
  if (!input.documentId.trim() || input.transactionDocumentId !== input.documentId) {
    return { kind: 'unresolved', reason: 'Transaction document does not match confirmed lookup' }
  }
  if (input.eventStatus !== 'SUCCESS') {
    return { kind: 'unresolved', reason: 'Linked fiscal event is not successful' }
  }
  const transactionReference = input.transactionReference?.trim()
  const eventReference = input.eventReference?.trim()
  if (!transactionReference || !eventReference || transactionReference !== eventReference) {
    return { kind: 'unresolved', reason: 'No matching persisted fiscal reference provenance' }
  }
  // These optional values are retained for diagnostics only, never silently
  // mapped to the receipt reference without provider-specific confirmation.
  void input.statusEvidence
  return { kind: 'verified', reference: transactionReference, source: 'existing-transaction-and-event' }
}

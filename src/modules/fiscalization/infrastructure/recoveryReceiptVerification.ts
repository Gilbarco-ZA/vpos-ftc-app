import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoiceStatusFiscalEvidence } from '../application/invoiceStatusFiscalEvidence'
import { reconcileRecoveryFiscalReference } from '../application/recoveryFiscalReferencePolicy'

/**
 * Read-only verification of a persisted receipt against the recovered
 * transaction and its linked SUCCESS event. No receipt creation or printing.
 */
export interface RecoveryReceiptRow {
  id: string
  receipt_number: string
  fiscal_data: unknown
  transaction_document_id: string | null
  latest_fiscal_event_id: string | null
  fiscalization_reference: string | null
  event_id: string | null
  event_status: string | null
  event_reference: string | null
}

export interface RecoveryReceiptReadPort {
  find(input: { stationId: string; transactionId: string }): Promise<RecoveryReceiptRow | null>
}

export interface RecoveryReceiptVerification {
  verified: boolean
  receiptId: string | null
  receiptNumber: string | null
  reason: string
}

export function verifyRecoveryReceiptRow(
  row: RecoveryReceiptRow | null,
  expected: { documentId: string; fiscalEventId: string; countryCode: FiscalCountryCode; statusEvidence?: InvoiceStatusFiscalEvidence },
): RecoveryReceiptVerification {
  const invalid = (reason: string): RecoveryReceiptVerification => ({
    verified: false, receiptId: row?.id ?? null,
    receiptNumber: row?.receipt_number ?? null, reason,
  })
  if (!row || !row.id?.trim() || !row.receipt_number?.trim()) return invalid('Persisted receipt missing')
  if (!expected.documentId.trim() || !expected.fiscalEventId.trim()) return invalid('Recovery identifiers missing')
  if (row.transaction_document_id !== expected.documentId ||
    row.latest_fiscal_event_id !== expected.fiscalEventId ||
    row.event_id !== expected.fiscalEventId ||
    row.event_status !== 'SUCCESS') {
    return invalid('Receipt transaction and fiscal event are not correlated')
  }
  let snapshot: unknown = row.fiscal_data
  if (typeof snapshot === 'string') {
    try { snapshot = JSON.parse(snapshot) } catch { return invalid('Receipt fiscal snapshot invalid') }
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return invalid('Receipt fiscal snapshot invalid')
  const data = snapshot as Record<string, unknown>
  const receipt = data.receipt
  if (data.schemaVersion !== 1 || !receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return invalid('Unsupported receipt fiscal snapshot')
  }
  const fields = receipt as Record<string, unknown>
  if (fields.receiptNumber !== row.receipt_number) return invalid('Receipt number mismatch')
  const provenance = reconcileRecoveryFiscalReference({
    countryCode: expected.countryCode,
    documentId: expected.documentId,
    transactionDocumentId: row.transaction_document_id,
    transactionReference: row.fiscalization_reference,
    eventReference: row.event_reference,
    eventStatus: row.event_status,
    statusEvidence: expected.statusEvidence,
  })
  if (provenance.kind !== 'verified' || data.reference !== provenance.reference) {
    return invalid('Fiscal receipt reference not verified')
  }
  return { verified: true, receiptId: row.id, receiptNumber: row.receipt_number, reason: 'Receipt reference and fiscal event correlated' }
}

export async function verifyPersistedRecoveryReceipt(
  port: RecoveryReceiptReadPort,
  input: { stationId: string; transactionId: string; documentId: string; fiscalEventId: string; countryCode: FiscalCountryCode; statusEvidence?: InvoiceStatusFiscalEvidence },
): Promise<RecoveryReceiptVerification> {
  if (!input.stationId.trim() || !input.transactionId.trim()) throw new Error('Receipt lookup identity required')
  const row = await port.find({ stationId: input.stationId.trim(), transactionId: input.transactionId.trim() })
  return verifyRecoveryReceiptRow(row, input)
}

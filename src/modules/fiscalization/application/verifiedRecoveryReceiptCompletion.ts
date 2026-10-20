import type { FiscalCountryCode } from '../domain/countryAdapter'
import type { InvoiceStatusFiscalEvidence } from './invoiceStatusFiscalEvidence'
import type { RecoveryReceiptReadPort } from '../infrastructure/recoveryReceiptVerification'
import { verifyPersistedRecoveryReceipt } from '../infrastructure/recoveryReceiptVerification'
import { assessRecoveryCompletionParity } from './recoveryCompletionParity'

export interface VerifiedRecoveryPrintPort {
  isAutoPrintEnabled(stationId: string): Promise<boolean>
  /** Must run inside the same transaction as the receipt lookup. */
  ensurePrintJob(input: {
    stationId: string
    transactionId: string
    receiptId: string
    receiptNumber: string
    idempotencyKey: string
  }): Promise<{ idempotencyVerified: boolean }>
}

/**
 * Read-verify-print coordinator only. Does not generate missing receipts
 * or create a connection. Both injected ports must use the same transaction.
 * Existing incomplete receipts are a blocker, never an authorization to print.
 */
export async function completeVerifiedRecoveredReceipt(
  receiptRead: RecoveryReceiptReadPort,
  printing: VerifiedRecoveryPrintPort,
  input: {
    stationId: string
    transactionId: string
    documentId: string
    fiscalEventId: string
    countryCode: FiscalCountryCode
    statusEvidence?: InvoiceStatusFiscalEvidence
  },
): Promise<{ ready: boolean; blockers: readonly string[] }> {
  const verified = await verifyPersistedRecoveryReceipt(receiptRead, input)
  if (!verified.verified || !verified.receiptId || !verified.receiptNumber) {
    return { ready: false, blockers: [verified.reason] }
  }
  const autoPrintEnabled = await printing.isAutoPrintEnabled(input.stationId)
  const printed = autoPrintEnabled
    ? await printing.ensurePrintJob({
        stationId: input.stationId.trim(),
        transactionId: input.transactionId.trim(),
        receiptId: verified.receiptId,
        receiptNumber: verified.receiptNumber,
        idempotencyKey: 'receipt:' + input.transactionId.trim() + ':default',
      })
    : { idempotencyVerified: false }
  const decision = assessRecoveryCompletionParity({
    fiscalEventLinked: true,
    receiptId: verified.receiptId,
    receiptNumber: verified.receiptNumber,
    receiptFiscalDataVerified: verified.verified,
    autoPrintEnabled,
    printJobIdempotencyVerified: printed.idempotencyVerified,
  })
  return { ready: decision.ready, blockers: decision.blockers }
}

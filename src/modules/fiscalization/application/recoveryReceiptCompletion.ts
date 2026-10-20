import { assessRecoveryCompletionParity } from './recoveryCompletionParity'

export interface RecoveryReceipt {
  id: string
  number: string
  fiscalDataVerified: boolean
}

export interface RecoveryReceiptCompletionPort {
  /** Must read in the same transaction as recovery status and event linking. */
  findReceipt(input: { stationId: string; transactionId: string }): Promise<RecoveryReceipt | null>
  /** The port must verify a persisted fiscal receipt against the recovered event. */
  ensureReceipt(input: { stationId: string; transactionId: string; documentId: string }): Promise<RecoveryReceipt>
  isAutoPrintEnabled(stationId: string): Promise<boolean>
  /** Must use the normal receipt:<transactionId>:default uniqueness key. */
  ensurePrintJob(input: {
    stationId: string
    transactionId: string
    receiptId: string
    receiptNumber: string
    idempotencyKey: string
  }): Promise<{ idempotencyVerified: boolean }>
}

export interface RecoveryReceiptCompletionResult {
  ready: boolean
  receiptId: string | null
  receiptNumber: string | null
  blockers: readonly string[]
}

/**
 * Test-only completion coordinator. Caller supplies operations already bound
 * to the recovery transaction. Never called by the live fiscalization worker.
 */
export async function completeRecoveredReceipt(
  port: RecoveryReceiptCompletionPort,
  input: { stationId: string; transactionId: string; documentId: string; fiscalEventLinked: boolean },
): Promise<RecoveryReceiptCompletionResult> {
  const stationId = input.stationId.trim()
  const transactionId = input.transactionId.trim()
  const documentId = input.documentId.trim()
  if (!stationId || !transactionId || !documentId) throw new Error('Recovery receipt identifiers required')
  if (!input.fiscalEventLinked) throw new Error('Linked fiscalization event required before receipt completion')

  let receipt = await port.findReceipt({ stationId, transactionId })
  if (!receipt) {
    receipt = await port.ensureReceipt({ stationId, transactionId, documentId })
  }
  if (!receipt.id?.trim() || !receipt.number?.trim() || !receipt.fiscalDataVerified) {
    const decision = assessRecoveryCompletionParity({
      fiscalEventLinked: true,
      receiptId: receipt.id ?? null,
      receiptNumber: receipt.number ?? null,
      receiptFiscalDataVerified: receipt.fiscalDataVerified === true,
      autoPrintEnabled: false,
      printJobIdempotencyVerified: false,
    })
    return { ready: false, receiptId: receipt.id || null, receiptNumber: receipt.number || null, blockers: decision.blockers }
  }
  const autoPrintEnabled = await port.isAutoPrintEnabled(stationId)
  const print = autoPrintEnabled ? await port.ensurePrintJob({
    stationId, transactionId, receiptId: receipt.id, receiptNumber: receipt.number,
    idempotencyKey: 'receipt:' + transactionId + ':default',
  }) : { idempotencyVerified: false }
  const decision = assessRecoveryCompletionParity({
    fiscalEventLinked: true,
    receiptId: receipt.id, receiptNumber: receipt.number,
    receiptFiscalDataVerified: receipt.fiscalDataVerified,
    autoPrintEnabled,
    printJobIdempotencyVerified: print.idempotencyVerified,
  })
  return { ready: decision.ready, receiptId: receipt.id, receiptNumber: receipt.number, blockers: decision.blockers }
}

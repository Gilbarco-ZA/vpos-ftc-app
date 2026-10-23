/**
 * Activation checklist for recovery completion parity.
 * This has no side effects and does not treat a fiscal-status confirmation
 * as proof that a receipt or print job is ready.
 */
export interface RecoveryCompletionEvidence {
  fiscalEventLinked: boolean
  receiptId: string | null
  receiptNumber: string | null
  receiptFiscalDataVerified: boolean
  autoPrintEnabled: boolean
  printJobIdempotencyVerified: boolean
}

export interface RecoveryCompletionDecision {
  ready: boolean
  blockers: readonly string[]
}

export function assessRecoveryCompletionParity(
  evidence: RecoveryCompletionEvidence,
): RecoveryCompletionDecision {
  const blockers: string[] = []
  if (!evidence.fiscalEventLinked) blockers.push('Fiscalization event must be linked to transaction')
  if (!evidence.receiptId?.trim() || !evidence.receiptNumber?.trim()) {
    blockers.push('Persisted receipt identity is required')
  }
  if (!evidence.receiptFiscalDataVerified) {
    blockers.push('Receipt fiscal data is not verified against recovered proxy evidence')
  }
  if (evidence.autoPrintEnabled && !evidence.printJobIdempotencyVerified) {
    blockers.push('Auto-print must use a verified idempotent print-job path')
  }
  return { ready: blockers.length === 0, blockers }
}

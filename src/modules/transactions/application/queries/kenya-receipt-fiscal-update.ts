import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'

const record = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null

const value = (...items: unknown[]): string | null => {
  for (const item of items) if (typeof item === 'string' && item.trim()) return item.trim()
  return null
}

/** Display-only merge. Never changes an invoice's persisted approval or reference. */
export function applyKenyaReceiptFiscalUpdate(
  receipt: NormalizedReceipt,
  input: { eventResponsePayload: unknown; canonicalResponsePayload: unknown; storedFiscalData: unknown; statusRow?: unknown; expectedDocumentId?: string | null },
): void {
  const event = record(input.eventResponsePayload)
  const eventReceipt = record(record(event?.details)?.receipt) ?? record(event?.receipt)
  const canonical = record(input.canonicalResponsePayload)
  const snapshot = record(input.storedFiscalData)
  const prior = record(snapshot?.receipt) ?? record(record(snapshot?.details)?.receipt)
  const status = record(input.statusRow)
  const matches = Boolean(status && input.expectedDocumentId &&
    value(status.documentId) === input.expectedDocumentId &&
    String(status.status ?? '').trim().toUpperCase() === 'APPROVED' &&
    status.error !== true)
  const checkedStatus = matches ? status : null
  const previousCode = value(eventReceipt?.fiscalVerificationCode, prior?.fiscalVerificationCode, canonical?.fiscalVerificationCode, receipt.footer.fiscalVerificationCode)
  const previousQr = value(eventReceipt?.fiscalQrCodeData, prior?.fiscalQrCodeData, canonical?.fiscalQrCodeData, receipt.footer.fiscalQrCodeData)
  // An explicitly refreshed, correlated Approved status supersedes stale local
  // verification fields for display. Never persist this display-only merge.
  const statusCode = value(checkedStatus?.fiscalVerificationCode)
  const statusQr = value(checkedStatus?.fiscalQrCodeData)
  const verification = value(statusCode, previousCode)
  const qr = value(statusQr, previousQr)
  if (verification) receipt.footer.fiscalVerificationCode = verification
  if (qr) receipt.footer.fiscalQrCodeData = qr
  const signatureConflicts = Boolean(statusCode && previousCode && statusCode !== previousCode)
  if (signatureConflicts) receipt.footer.receiptSignature = undefined
  const signature = signatureConflicts ? null : value(eventReceipt?.receiptSignature, prior?.receiptSignature)
  const internal = value(eventReceipt?.receiptInternalData, prior?.receiptInternalData)
  if (signature) receipt.footer.receiptSignature = signature
  if (internal) receipt.footer.receiptInternalData = internal
  const number = value(eventReceipt?.receiptNumber, prior?.receiptNumber, checkedStatus?.documentNumber)
  if (number) receipt.meta.receiptNumber = number
}

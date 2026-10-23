import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null

const nonempty = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Reconciles *display* fields using the latest persisted fiscal response and
 * the historical receipt snapshot. Does not create receipts, mutate fiscal
 * references, or infer approval from status alone.
 */
export function applyKenyaReceiptFiscalUpdate(
  receipt: NormalizedReceipt,
  source: {
    eventResponsePayload: unknown
    canonicalResponsePayload: unknown
    storedFiscalData: unknown
  },
): void {
  const event = object(source.eventResponsePayload)
  const details = object(event?.details)
  const eventReceipt = object(details?.receipt) ?? object(event?.receipt)
  const canonical = object(source.canonicalResponsePayload)
  const snapshot = object(source.storedFiscalData)
  const persistedReceipt = object(snapshot?.receipt)

  const verification = nonempty(
    eventReceipt?.fiscalVerificationCode,
    canonical?.fiscalVerificationCode,
    persistedReceipt?.fiscalVerificationCode,
    receipt.footer.fiscalVerificationCode,
  )
  const qr = nonempty(
    eventReceipt?.fiscalQrCodeData,
    canonical?.fiscalQrCodeData,
    persistedReceipt?.fiscalQrCodeData,
    receipt.footer.fiscalQrCodeData,
  )
  const signature = nonempty(eventReceipt?.receiptSignature, persistedReceipt?.receiptSignature)
  const internal = nonempty(eventReceipt?.receiptInternalData, persistedReceipt?.receiptInternalData)
  const number = nonempty(eventReceipt?.receiptNumber, persistedReceipt?.receiptNumber)

  if (verification) receipt.footer.fiscalVerificationCode = verification
  if (qr) receipt.footer.fiscalQrCodeData = qr
  if (signature) receipt.footer.receiptSignature = signature
  if (internal) receipt.footer.receiptInternalData = internal
  if (number) receipt.meta.receiptNumber = number
}

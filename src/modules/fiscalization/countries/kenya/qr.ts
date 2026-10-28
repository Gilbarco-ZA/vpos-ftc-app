import { createHash } from 'node:crypto'

export const KENYA_QR_PREFIXES = {
  development: 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=',
  production: 'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=',
  manual: '',
} as const

export type KenyaQrMode = keyof typeof KENYA_QR_PREFIXES

export function kenyaQrPrefix(mode: KenyaQrMode, manualUrl = ''): string {
  const url = mode === 'manual' ? manualUrl.trim() : KENYA_QR_PREFIXES[mode]
  if (!url) return ''
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Kenya verification QR prefix must be HTTPS')
  return url
}

// Matches the cloud helper's SHA256 -> Base64 -> alphanumeric uppercase transformation.
function uniqueString(input: string, length: number): string {
  return createHash('sha256').update(input, 'utf8').digest('base64')
    .replace(/[^a-zA-Z0-9=]/g, '').toUpperCase().slice(0, length).padEnd(length, '0')
}

export function generateKenyaOfflineEvidence(input: {
  pin: string
  invoiceNumber: number
  issuedAt: Date
}) {
  const pin = input.pin.trim()
  if (!pin || !Number.isSafeInteger(input.invoiceNumber) || input.invoiceNumber <= 0 ||
      Number.isNaN(input.issuedAt.getTime())) {
    throw new Error('Kenya offline evidence needs a PIN, allocated positive invoice number and issue date')
  }
  const timestamp = input.issuedAt.toISOString().replace(/[-:T]/g, '').substring(0, 14)
  return {
    receiptInternalData: uniqueString(pin + timestamp + input.invoiceNumber + 'PIN', 26),
    receiptSignature: uniqueString(pin + timestamp + input.invoiceNumber + 'RCPDATE', 16),
  }
}

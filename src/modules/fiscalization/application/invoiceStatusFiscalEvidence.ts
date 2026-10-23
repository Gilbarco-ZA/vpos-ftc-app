export interface InvoiceStatusFiscalEvidence {
  fiscalId: string | null
  fiscalCode: string | null
  fiscalVerificationCode: string | null
  fiscalQrCodeData: string | null
  revenueAuthorityReference: string | null
}

const evidenceFields = [
  'fiscalId', 'fiscalCode', 'fiscalVerificationCode',
  'fiscalQrCodeData', 'revenueAuthorityReference',
] as const

/**
 * Extract named fields exactly as defined by invoice status Swagger.
 * No field is assumed to be equivalent to a receipt fiscal reference.
 */
export function parseInvoiceStatusFiscalEvidence(
  row: unknown,
): InvoiceStatusFiscalEvidence | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const source = row as Record<string, unknown>
  const output: Record<string, string | null> = {}
  for (const field of evidenceFields) {
    const value = source[field]
    if (value == null) {
      output[field] = null
    } else if (typeof value === 'string' && value.trim()) {
      output[field] = value.trim()
    } else {
      return null
    }
  }
  return output as unknown as InvoiceStatusFiscalEvidence
}

import type { CanonicalInvoice, ValidationIssue, ValidationResult } from './countryAdapter'

export interface InvoicePolicy {
  validate(invoice: CanonicalInvoice): ValidationResult
  buildPayload(invoice: CanonicalInvoice): unknown
}

export const roundInvoiceMoney = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100

export function validateInvoiceCore(invoice: CanonicalInvoice): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!invoice.documentId.trim()) issues.push({ field: 'documentId', message: 'Document ID is required' })
  if (!invoice.issuedAt.trim() || Number.isNaN(Date.parse(invoice.issuedAt))) {
    issues.push({ field: 'issuedAt', message: 'A valid invoice timestamp is required' })
  }
  if (!invoice.lines.length) issues.push({ field: 'lines', message: 'Invoice requires at least one line' })
  invoice.lines.forEach((line, index) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      issues.push({ field: `lines.${index}.quantity`, message: 'Quantity must be positive' })
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      issues.push({ field: `lines.${index}.unitPrice`, message: 'Unit price must be non-negative' })
    }
    if (line.taxRate != null && (!Number.isFinite(line.taxRate) || line.taxRate < 0)) {
      issues.push({ field: `lines.${index}.taxRate`, message: 'Tax rate is invalid' })
    }
  })
  return issues
}

export function requireValidInvoice(policy: InvoicePolicy, invoice: CanonicalInvoice): void {
  const result = policy.validate(invoice)
  if (!result.valid) throw new Error(result.issues.map(i => `${i.field}: ${i.message}`).join('; '))
}

import type { CanonicalInvoice, ValidationIssue } from './countryAdapter'
import { roundInvoiceMoney } from './invoicePolicy'

/** Validate authoritative amounts without recomputing VAT from gross values. */
export function validateFinancialIntegrity(invoice: CanonicalInvoice): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const check = (field: string, value: number | null | undefined) => {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      issues.push({ field, message: 'Amount must be finite and non-negative' })
    }
  }
  invoice.lines.forEach((line, index) => {
    check(`lines.${index}.priceExtension`, line.priceExtension)
    check(`lines.${index}.netTotal`, line.netTotal)
    line.taxes?.forEach((tax, taxIndex) => {
      check(`lines.${index}.taxes.${taxIndex}.base`, tax.base)
      check(`lines.${index}.taxes.${taxIndex}.amount`, tax.amount)
      if (!Number.isFinite(tax.rate) || tax.rate < 0) {
        issues.push({ field: `lines.${index}.taxes.${taxIndex}.rate`, message: 'Invalid tax rate' })
      }
    })
  })
  if (invoice.totals) {
    Object.entries(invoice.totals).forEach(([key, value]) => check(`totals.${key}`, value))
    const sum = roundInvoiceMoney(invoice.tenders.reduce((amount, tender) => amount + tender.amount, 0))
    if (invoice.tenders.length && Number.isFinite(sum) &&
        Math.abs(sum - invoice.totals.amount) > 0.01) {
      issues.push({ field: 'tenders', message: 'Tender sum does not match authoritative invoice total' })
    }
  }
  return issues
}

export function invoiceExpectedAmount(invoice: CanonicalInvoice): number {
  return invoice.totals?.amount ?? roundInvoiceMoney(
    invoice.lines.reduce((sum, line) => sum +
      (line.priceExtension ?? line.quantity * line.unitPrice), 0),
  )
}

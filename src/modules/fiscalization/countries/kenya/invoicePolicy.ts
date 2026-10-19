import type { CanonicalInvoice, ValidationIssue, ValidationResult } from '../../domain/countryAdapter'
import { requireValidInvoice, roundInvoiceMoney, validateInvoiceCore } from '../../domain/invoicePolicy'
import type { InvoicePolicy } from '../../domain/invoicePolicy'
import { kenyaProductPolicy } from './productPolicy'

const PAYMENT_METHODS: Record<string, string> = {
  '01': 'Cash', CASH: 'Cash',
  '02': 'Credit', CREDIT: 'Credit', ACCOUNT: 'Credit', INVOICE: 'Credit',
  '03': 'Cash/Credit', CASHCREDIT: 'Cash/Credit',
  '04': 'Cheque', CHEQUE: 'Cheque', CHECK: 'Cheque', BANKCHEQUE: 'Cheque',
  '05': 'Card', CARD: 'Card', DEBITCARD: 'Card', CREDITCARD: 'Card',
  '06': 'MobileMoney', MOBILE: 'MobileMoney', MOBILEMONEY: 'MobileMoney',
  MPESA: 'MobileMoney', EMONEY: 'MobileMoney',
  '07': 'Other', OTHER: 'Other',
}

export function kenyaTenderMethod(value: string): string | null {
  const key = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return PAYMENT_METHODS[key] ?? null
}

export const kenyaInvoicePolicy: InvoicePolicy = {
  validate(invoice): ValidationResult {
    const issues: ValidationIssue[] = validateInvoiceCore(invoice)
    if (invoice.currency.trim().toUpperCase() !== 'KES') {
      issues.push({ field: 'currency', message: 'Kenya invoices require KES' })
    }
    invoice.lines.forEach((line, index) => {
      const result = kenyaProductPolicy.validate(line.product)
      if (!result.valid) issues.push(...result.issues.map(issue => ({
        ...issue, field: `lines.${index}.product.${issue.field}`,
      })))
    })
    if (!invoice.tenders.length) {
      issues.push({ field: 'tenders', message: 'At least one tender is required' })
    }
    invoice.tenders.forEach((tender, index) => {
      if (!kenyaTenderMethod(tender.method)) {
        issues.push({ field: `tenders.${index}.method`, message: 'Unsupported Kenya payment method' })
      }
      if (!Number.isFinite(tender.amount) || tender.amount <= 0) {
        issues.push({ field: `tenders.${index}.amount`, message: 'Tender amount must be positive' })
      }
    })
    const expected = roundInvoiceMoney(invoice.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice, 0,
    ))
    const actual = roundInvoiceMoney(invoice.tenders.reduce(
      (sum, tender) => sum + tender.amount, 0,
    ))
    if (Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) > 0.01) {
      issues.push({ field: 'tenders', message: 'Tender amounts must match invoice total' })
    }
    return issues.length ? { valid: false, issues } : { valid: true }
  },
  buildPayload(invoice) {
    requireValidInvoice(this, invoice)
    return {
      DocumentId: invoice.documentId,
      issueDateTime: invoice.issuedAt,
      ...(invoice.buyer ? { buyer: invoice.buyer } : {}),
      Lines: invoice.lines.map(line => ({
        lineType: 'Sale',
        product: {
          productId: line.product.id,
          productCode: line.product.code,
          productClassCode: line.product.classCode,
          productTypeCode: line.product.typeCode,
          description: line.product.name,
          unitOfMeasure: line.product.unitOfMeasure ?? undefined,
          unitOfPackaging: line.product.unitOfPackaging ?? undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          hazardousIndicator: line.product.hazardousIndicator ?? false,
          ...(line.fuel ? { fuel: line.fuel } : {}),
        },
        taxes: [{ type: line.product.taxCode, rate: line.taxRate ?? 0 }],
      })),
      Currency: 'KES',
      Payment: {
        Tenders: invoice.tenders.map(tender => ({
          Method: kenyaTenderMethod(tender.method),
          Amount: roundInvoiceMoney(tender.amount),
        })),
      },
    }
  },
}

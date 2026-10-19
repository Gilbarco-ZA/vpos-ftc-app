import { invoiceExpectedAmount, validateFinancialIntegrity } from '../../domain/financialValidation'
import type { CanonicalInvoice, ValidationIssue, ValidationResult } from '../../domain/countryAdapter'
import { requireValidInvoice, roundInvoiceMoney, validateInvoiceCore } from '../../domain/invoicePolicy'
import type { InvoicePolicy } from '../../domain/invoicePolicy'
import { tanzaniaProductPolicy } from './productPolicy'

/**
 * Tanzania requires fiscal metadata created by the existing enrichment workflow.
 * This test-only mapper refuses to manufacture required TRA values.
 */
type TanzaniaInvoiceMetadata = {
  documentNumber?: string
  createdByName?: string
  invoiceDate?: string
  tanzania?: Record<string, unknown>
}

const readMetadata = (invoice: CanonicalInvoice): TanzaniaInvoiceMetadata =>
  (invoice.metadata ?? {}) as TanzaniaInvoiceMetadata

export const tanzaniaInvoicePolicy: InvoicePolicy = {
  validate(invoice): ValidationResult {
    const issues: ValidationIssue[] = [...validateInvoiceCore(invoice), ...validateFinancialIntegrity(invoice)]
    if (invoice.currency.trim().toUpperCase() !== 'TZS') {
      issues.push({ field: 'currency', message: 'Tanzania invoices require TZS' })
    }
    invoice.lines.forEach((line, index) => {
      const result = tanzaniaProductPolicy.validate(line.product)
      if (!result.valid) issues.push(...result.issues.map(issue => ({
        ...issue, field: `lines.${index}.product.${issue.field}`,
      })))
    })
    if (!readMetadata(invoice).tanzania) {
      issues.push({ field: 'metadata.tanzania', message: 'Tanzania fiscal enrichment is required' })
    }
    return issues.length ? { valid: false, issues } : { valid: true }
  },
  buildPayload(invoice) {
    requireValidInvoice(this, invoice)
    const meta = readMetadata(invoice)
    const issueDateTime = String(meta.invoiceDate ?? invoice.issuedAt)
      .replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '')
    const lines = invoice.lines.map((line, index) => {
      const gross = line.priceExtension ?? roundInvoiceMoney(line.quantity * line.unitPrice)
      const rate = line.taxRate ?? 0
      const net = line.netTotal ?? roundInvoiceMoney(gross / (1 + rate / 100))
      const tax = roundInvoiceMoney(gross - net)
      return {
        lineType: line.lineType ?? (line.fuel ? 'FuelSale' : 'Sale'),
        lineId: line.lineId ?? String(index + 1),
        product: {
          productId: line.product.id,
          productCode: line.product.code,
          productClassCode: line.product.classCode,
          productTypeCode: line.product.typeCode,
          description: line.product.name,
          unitOfMeasure: line.product.unitOfMeasure,
          unitOfPackaging: line.product.unitOfPackaging,
          quantity: line.quantity,
          unitPrice: line.taxes?.length ? line.unitPrice : roundInvoiceMoney(line.unitPrice / (1 + rate / 100)),
          priceExtension: gross,
          netTotal: net,
          hazardousIndicator: line.product.hazardousIndicator ?? false,
          commodityCode: line.commodityCode ?? null,
          ...(line.fuel ? { fuel: line.fuel } : {}),
        },
        taxes: line.taxes ?? [{ type: line.product.taxCode, rate, base: net, amount: tax }],
        discounts: line.discounts,
      }
    })
    const total = invoiceExpectedAmount(invoice)
    return {
      documentId: invoice.documentId,
      documentNumber: meta.documentNumber ?? null,
      documentType: 'Invoice',
      issueDateTime,
      currency: 'TZS',
      createdByName: invoice.createdByName ?? meta.createdByName ?? 'VPOS-LITE',
      isOnline: invoice.isOnline ?? true,
      ...(invoice.buyer ? { buyer: invoice.buyer } : {}),
      lines,
      totals: invoice.totals ?? { amount: total },
      payment: invoice.tenders.length ? { tenders: invoice.tenders } : undefined,
      notes: invoice.notes ?? null,
      countryCode: 'TZ',
      tanzania: { ...meta.tanzania, invoiceDate: issueDateTime },
    }
  },
}

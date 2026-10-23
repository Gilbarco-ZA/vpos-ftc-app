import type { ProxyCreditNotesRequest, ProxyCreditNoteLineDto, ProxyPaymentMethod } from '@/src/shared/fiscalization/proxy/contracts'
import type { ValidationResult } from '../../domain/countryAdapter'
import type { CreditNotePolicy } from '../../domain/creditNotePolicy'
import { requireValidCreditNote, validateCreditNoteCore } from '../../domain/creditNotePolicy'

/**
 * Test-only Kenya credit-note mapper. Matches the current generic proxy
 * creditNotes[] envelope; confirm country-specific acceptance before enabling.
 */
export const kenyaCreditNotePolicy: CreditNotePolicy = {
  validate(note): ValidationResult {
    const issues = validateCreditNoteCore(note)
    if (note.invoice.currency.toUpperCase() !== 'KES') {
      issues.push({ field: 'invoice.currency', message: 'Kenya credit notes require KES' })
    }
    return issues.length ? { valid: false, issues } : { valid: true }
  },
  buildPayload(note): ProxyCreditNotesRequest {
    requireValidCreditNote(this, note)
    const lines: ProxyCreditNoteLineDto[] = note.invoice.lines.map(line => ({
      lineType: line.lineType ?? 'Sale',
      product: {
        productId: line.product.id,
        productCode: line.product.code,
        productClassCode: line.product.classCode ?? null,
        productTypeCode: line.product.typeCode ?? null,
        description: line.product.name,
        unitOfMeasure: line.product.unitOfMeasure ?? null,
        unitOfPackaging: line.product.unitOfPackaging ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        hazardousIndicator: line.product.hazardousIndicator ?? null,
        fuel: line.fuel ? {
          gradeId: line.fuel.gradeId ?? null,
          gradeName: line.fuel.gradeName ?? null,
          tankId: line.fuel.tankId ?? null,
          pumpId: line.fuel.pumpId ?? null,
          nozzleId: line.fuel.nozzleId ?? null,
        } : null,
      },
      taxes: (line.taxes ?? []).map(tax => ({ type: tax.type, rate: tax.rate })),
    }))
    const allowedMethods: readonly string[] = ['Cash', 'Credit', 'Cash/Credit', 'Cheque', 'Card', 'MobileMoney', 'Other']
    if (!note.invoice.tenders.length || note.invoice.tenders.some(tender =>
      !allowedMethods.includes(tender.method) || !Number.isFinite(tender.amount) || tender.amount < 0
    )) {
      throw new Error('Kenya credit note requires valid original payment tenders')
    }
    return { creditNotes: [{
      isOnline: note.isOnline,
      documentId: note.creditNoteId,
      documentNumber: note.documentNumber ?? note.creditNoteId,
      documentReference: note.originalDocumentId,
      documentType: 'Return',
      modificationType: 'None',
      issueDateTime: note.issuedAt,
      createdByName: note.createdByName,
      reasonCode: note.reasonCode,
      reason: note.reason.trim() || 'Credit note issued',
      lines,
      payment: { tenders: note.invoice.tenders.map(tender => ({
        method: tender.method as ProxyPaymentMethod, amount: tender.amount,
      })) },
    }] }
  },
}

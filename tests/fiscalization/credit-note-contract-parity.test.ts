import assert from 'node:assert/strict'
import test from 'node:test'
import { getCountryCreditNotePolicy } from '@/src/modules/fiscalization/application/creditNotePolicyRegistry'
import { mapTransactionToProxyCreditNote } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'
import type { CanonicalCreditNote } from '@/src/modules/fiscalization/domain/creditNotePolicy'

test('Kenya credit note preserves production envelope and reference fields', () => {
  const transaction = {
    id: 'TX-1', product_id: 'PRD-1', product_code: 'G1', grade_id: '4',
    fuel_type: 'Petrol', volume: 2, total_amount: 366,
    created_at: '2026-10-19T11:00:00Z',
  }
  const args = {
    transaction, customer: null, station: { country: 'KE' },
    currency: 'KES', createdByName: 'Operator', creditNoteId: 'CN-1',
    documentReference: 'INV-1', reasonCode: '13', notes: 'Customer return',
  }
  const existing = mapTransactionToProxyCreditNote(args)
  const note: CanonicalCreditNote = {
    creditNoteId: 'CN-1', originalDocumentId: 'INV-1',
    issuedAt: existing.creditNotes[0].issueDateTime,
    reasonCode: '13', reason: 'Customer return', createdByName: 'Operator',
    isOnline: existing.creditNotes[0].isOnline ?? true,
    invoice: {
      documentId: 'INV-1',
      issuedAt: existing.creditNotes[0].issueDateTime,
      currency: 'KES', tenders: existing.creditNotes[0].payment.tenders,
      lines: (existing.creditNotes[0].lines ?? []).filter(line => line.product).map(line => ({
        product: {
          id: line.product?.productId ?? 'PRD-1',
          code: line.product?.productCode ?? 'G1',
          name: line.product?.description ?? 'Petrol',
          price: line.product?.unitPrice ?? 0,
          currency: 'KES',
        },
        lineType: line.lineType, quantity: line.product?.quantity ?? 1,
        unitPrice: line.product?.unitPrice ?? 0,
        taxes: (line.taxes ?? []).map(tax => ({ type: tax.type ?? '', rate: tax.rate ?? 0 })),
      })),
    },
  }
  const candidate = getCountryCreditNotePolicy('KE').buildPayload(note) as typeof existing
  assert.equal(candidate.creditNotes[0].documentId, existing.creditNotes[0].documentId)
  assert.equal(candidate.creditNotes[0].documentReference, existing.creditNotes[0].documentReference)
  assert.equal(candidate.creditNotes[0].documentType, existing.creditNotes[0].documentType)
  assert.equal(candidate.creditNotes[0].reasonCode, existing.creditNotes[0].reasonCode)
  assert.deepEqual(candidate.creditNotes[0].payment, existing.creditNotes[0].payment)
  assert.deepEqual(candidate.creditNotes[0].lines, existing.creditNotes[0].lines)
})

test('Tanzania draft credit note stays blocked until real API contract is verified', () => {
  const policy = getCountryCreditNotePolicy('TZ')
  assert.throws(() => policy.buildPayload({} as CanonicalCreditNote), /not yet verified/)
})

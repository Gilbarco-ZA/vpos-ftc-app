import assert from 'node:assert/strict'
import test from 'node:test'

import { getCountryCreditNotePolicy } from '@/src/modules/fiscalization/application/creditNotePolicyRegistry'
import type { CanonicalCreditNote } from '@/src/modules/fiscalization/domain/creditNotePolicy'

const kenyaNote: CanonicalCreditNote = {
  creditNoteId: 'CN-101',
  originalDocumentId: 'INV-101',
  issuedAt: '2026-10-19T10:00:00.000Z',
  reasonCode: '13',
  reason: 'Customer return',
  createdByName: 'Test User',
  isOnline: true,
  invoice: {
    documentId: 'INV-101',
    issuedAt: '2026-10-18T10:00:00.000Z',
    currency: 'KES',
    tenders: [{ method: 'Cash', amount: 366 }],
    lines: [{
      product: {
        id: 'PRD-1', code: 'KE2TYL0000001', name: 'Petrol 93',
        classCode: '9901300102', typeCode: '2',
        unitOfMeasure: 'L', unitOfPackaging: 'TY',
        currency: 'KES', price: 183, taxCode: 'B',
      },
      lineType: 'FuelSale', fuel: { gradeId: '4' }, quantity: 2, unitPrice: 183,
      taxes: [{ type: 'B', rate: 16 }],
    }],
  },
}

test('Kenya credit note has current proxy envelope and document reference', () => {
  const policy = getCountryCreditNotePolicy('KE')
  assert.equal(policy.validate(kenyaNote).valid, true)
  const payload = policy.buildPayload(kenyaNote) as {
    creditNotes: Array<{ documentReference: string | null; lines: unknown[]; reasonCode: string; payment: { tenders: unknown[] } }>
  }
  assert.equal(payload.creditNotes[0].documentReference, 'INV-101')
  assert.equal(payload.creditNotes[0].reasonCode, '13')
  assert.equal(payload.creditNotes[0].payment.tenders.length, 1)
})

test('credit note cannot refer to itself', () => {
  const policy = getCountryCreditNotePolicy('KE')
  assert.equal(policy.validate({ ...kenyaNote, creditNoteId: 'INV-101' }).valid, false)
})

test('Tanzania credit note fails closed pending verified reversal contract', () => {
  const policy = getCountryCreditNotePolicy('TZ')
  const note = { ...kenyaNote, invoice: { ...kenyaNote.invoice, currency: 'TZS' } }
  assert.equal(policy.validate(note).valid, false)
  assert.throws(() => policy.buildPayload(note), /not yet verified/)
})

test('unsupported country does not fall back to Kenya', () => {
  assert.throws(() => getCountryCreditNotePolicy('XX'), /Unsupported fiscalization country/)
})

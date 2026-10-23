import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveKenyaCreditNoteDocumentId, mapTransactionToProxyCreditNote } from '../../src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'

test('maps credit note payload with full invoice-derived values for proxy', () => {
  const payload = mapTransactionToProxyCreditNote({
    transaction: {
      id: 'txn-100',
      pos_reference: 'POS-100',
      document_number: '1194',
      transaction_date_time: '2026-05-27T10:15:30.000Z',
      lines: [
        {
          productId: 'PRD-1',
          productCode: 'FUEL-95',
          description: 'Petrol 95',
          quantity: 10,
          unitPrice: 100,
          lineTotal: 1000,
          taxCode: 'B',
          taxRate: 16,
        },
      ],
    },
    customer: { buyerType: 'B2C', name: 'Jane Doe', pin: 'P12345' },
    station: { country: 'KE' },
    vatRate: 16,
    taxType: 'B',
    taxRate: 16,
    createdByName: 'Tester',
    creditNoteId: 'cn-200',
    documentReference: 'INV-445',
    reasonCode: '13',
    notes: 'Customer returned product',
  })

  const note = payload.creditNotes[0]
  assert.ok(note, 'expected credit note payload item')

  assert.equal('IsOnline' in note, false)
  assert.equal(note.isOnline, true)
  assert.equal('DocumentId' in note, false)
  assert.equal(note.documentId, deriveKenyaCreditNoteDocumentId('cn-200', 'INV-445'))
  assert.equal(note.documentId?.length, note.documentReference?.length)
  assert.notEqual(note.documentId, note.documentReference)
  assert.equal(note.documentNumber, null)
  assert.equal(note.documentReference, 'INV-445')
  assert.equal(note.documentType, 'Return')
  assert.equal(note.modificationType, 'None')
  assert.equal(note.reasonCode, '13')
  assert.equal(note.reason, 'Customer returned product')
  assert.equal(note.createdByName, 'Tester')
  assert.equal(note.currency, 'KES')
  assert.ok(note.payment?.tenders?.length)
  assert.equal(note.payment?.tenders?.[0]?.amount, 1000)
  assert.equal(note.totals?.amount, 1000)

  assert.equal('Lines' in note, false)
  assert.equal(note.lines?.length, 1)
  assert.equal(note.lines?.[0]?.lineType, 'FuelSale')
  assert.equal(note.lines?.[0]?.product?.productCode, 'FUEL-95')
  assert.equal(note.lines?.[0]?.product?.quantity, 10)
  assert.equal(note.lines?.[0]?.product?.unitPrice, 86.21)
  assert.equal(note.lines?.[0]?.taxes?.[0]?.type, 'B')
  assert.equal(note.lines?.[0]?.taxes?.[0]?.rate, 16)
})

test('Kenya credit note rejects invalid original reference or reason code', () => {
  const base = {
    transaction: {
      id: 'txn-1',
      pos_reference: 'POS-1',
      transaction_date_time: '2026-10-22T08:19:44.405Z',
      total_amount: 116,
      lines: [{
        productId: 'P1', productCode: 'P1', description: 'Fuel',
        quantity: 1, unitPrice: 116, lineTotal: 116, taxCode: 'B', taxRate: 16,
      }],
    },
    station: { country: 'KE' },
    customer: null,
    vatRate: 16,
    taxType: 'B',
    taxRate: 16,
    creditNoteId: 'cn-1',
  }
  assert.throws(() => mapTransactionToProxyCreditNote({
    ...base, documentReference: 'ORIGINAL-DOC', reasonCode: 'RETURN',
  }), /reasonCode/)
  assert.throws(() => mapTransactionToProxyCreditNote({
    ...base, documentReference: 'cn-1',
  }), /original fiscal document/)
  assert.throws(() => mapTransactionToProxyCreditNote({
    ...base, documentReference: '',
  }), /original fiscal documentId/)
})

test('Kenya credit note rejects nonfuel lines and unsupported countries', () => {
  const base = {
    transaction: {
      id: 'txn-2', transaction_date_time: '2026-10-23T08:00:00Z',
      lines: [{ productId: 'SNACK', description: 'Snack', quantity: 1, unitPrice: 10, lineTotal: 10 }],
    },
    customer: null, station: { country: 'KE' },
    creditNoteId: 'cn-2', documentReference: 'ORIGINAL-2', reasonCode: '06',
  }
  assert.throws(() => mapTransactionToProxyCreditNote(base), /only for fuel transactions/)
  assert.throws(() => mapTransactionToProxyCreditNote({
    ...base, station: { country: 'TZ' },
  }), /only for Kenya/)
  assert.throws(() => mapTransactionToProxyCreditNote({
    ...base, station: { country: 'ZA' },
  }), /only for Kenya/)
})

test('Kenya credit note document ID matches original hex reference shape and is retry stable', () => {
  const original = 'D1CEF7E18822'
  const first = deriveKenyaCreditNoteDocumentId('de012727-600d-499f-8323-37a62d822330', original)
  assert.match(first, /^[0-9A-F]{12}$/)
  assert.equal(first.length, original.length)
  assert.notEqual(first, original)
  assert.equal(deriveKenyaCreditNoteDocumentId('de012727-600d-499f-8323-37a62d822330', original), first)
  assert.notEqual(deriveKenyaCreditNoteDocumentId('a9f5a360-f2a2-4cb3-a646-a8944c330a54', original), first)
})

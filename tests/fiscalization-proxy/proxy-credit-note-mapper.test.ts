import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTransactionToProxyCreditNote } from '../../src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'

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
  assert.equal(note.documentId, 'POS-100')
  assert.equal(note.documentNumber, '1194')
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

test('Kenya credit note rejects an invalid POS reference or reason code', () => {
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
    ...base, reasonCode: 'RETURN',
  }), /reasonCode/)
  assert.throws(() => mapTransactionToProxyCreditNote({
    ...base, transaction: { ...base.transaction, pos_reference: 'A'.repeat(21) },
  }), /documentId/)
})

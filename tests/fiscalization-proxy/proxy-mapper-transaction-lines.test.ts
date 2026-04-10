import test from 'node:test'
import assert from 'node:assert/strict'

import { toSampleInvoicePayload } from '../../src/shared/fiscalization/proxy/payload'
import { mapTransactionToProxyInvoice } from '../../src/shared/fiscalization/proxy/mapper'

test('maps transaction lines into the expected fiscal product payload shape', () => {
  const invoice = mapTransactionToProxyInvoice({
    transaction: {
      id: 'txn-1',
      pos_reference: 'POS-1',
      pump_number: 4,
      transaction_date_time: '2026-03-18T08:00:00.000Z',
      lines: [
        {
          productId: 'PRD-1',
          productCode: 'KE2TYL0000001',
          productClassCode: '9901300102',
          productTypeCode: '2',
          description: 'Petrol 93',
          category: 'Fuel',
          unitOfMeasure: 'L',
          unitOfPackaging: 'TY',
          quantity: 43,
          unitPrice: 183,
          lineTotal: 7869,
          hazardousIndicator: true,
          taxCode: 'B',
          taxRate: 16,
          gradeId: '10',
          gradeName: 'Gasolina',
          tankId: 'tank-1',
          pumpId: 'pump-1',
          nozzleId: 'nozzle-1',
        },
        {
          productId: 'PRD-3',
          productCode: 'KE2BVL0000001',
          productClassCode: '99011021',
          productTypeCode: '2',
          description: 'Unprocessed Milk',
          unitOfMeasure: 'L',
          unitOfPackaging: 'BV',
          quantity: 1,
          unitPrice: 60,
          lineTotal: 60,
          hazardousIndicator: false,
          taxCode: 'C',
          taxRate: 0,
        },
      ],
    },
    customer: { buyerType: 'B2C', name: 'David Mukuria', pin: 'P000000002F' },
    station: { country: 'KE' },
    vatRate: 16,
    taxType: 'B',
    taxRate: 16,
    createdByName: 'Test User',
  })

  const payload = toSampleInvoicePayload(invoice) as any

  assert.equal(payload.DocumentId, 'POS-1')
  assert.equal(payload.createdByName, 'Test User')
  assert.deepEqual(payload.buyer, {
    buyerType: 'B2C',
    name: 'David Mukuria',
    pin: 'P000000002F',
  })
  assert.equal(payload.Lines.length, 2)
  assert.equal(payload.Lines[0].lineType, 'FuelSale')
  assert.deepEqual(payload.Lines[0].taxes, [{ type: 'B', rate: 16 }])
  assert.deepEqual(payload.Lines[0].product.fuel, {
    gradeId: '10',
    gradeName: 'Gasolina',
    tankId: 'tank-1',
    pumpId: 'pump-1',
    nozzleId: 'nozzle-1',
  })
  assert.equal(payload.Lines[1].lineType, 'Sale')
  assert.deepEqual(payload.Lines[1].taxes, [{ type: 'C', rate: 0 }])
  assert.equal(payload.Lines[1].product.hazardousIndicator, false)
})

test('keeps zero-rated lines at 0 instead of coercing them to 16', () => {
  const invoice = mapTransactionToProxyInvoice({
    transaction: {
      id: 'txn-2',
      created_at: '2026-03-18T08:00:00.000Z',
      lines: [
        {
          productId: 'PRD-3',
          description: 'Unprocessed Milk',
          quantity: 1,
          unitPrice: 60,
          lineTotal: 60,
          taxCode: 'C',
          taxRate: 0,
          hazardousIndicator: false,
        },
      ],
    },
    customer: null,
    station: { country: 'KE' },
    vatRate: 16,
  })

  const payload = toSampleInvoicePayload(invoice) as any
  assert.deepEqual(payload.Lines[0].taxes, [{ type: 'C', rate: 0 }])
})

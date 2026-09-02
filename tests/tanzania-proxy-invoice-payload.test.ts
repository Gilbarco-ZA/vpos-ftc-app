import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import {
  isTanzaniaCountry,
  normalizeFiscalCountryCode,
} from '@/src/modules/tanzania-fiscal/infrastructure/country'
import {
  toCountrySpecificInvoicePayload,
} from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload'

test('Tanzania proxy payload retains exact sequencing and tax inputs for vpos-proxy', () => {
  const invoice: ProxyInvoiceRequest = {
    deviceId: 'd4ae0668-5e73-4d66-a4a3-c69fb5f03862',
    documentId: 'transaction-1',
    documentNumber: 'INV-2026/08/05-03',
    documentType: 'INVOICE',
    issueDateTime: '2026-08-11T13:04:16.649+03:00',
    currency: 'TZS',
    createdByName: 'John',
    lines: [
      {
        lineId: '1',
        product: {
          description: 'Diesel',
          quantity: 55.5,
          unitPrice: 150,
          priceExtension: 8325,
          netTotal: 7055.08,
          commodityCode: '15101505',
          fuel: {
            gradeName: 'Diesel',
            tankId: '1',
            tankVolume: 34960,
            pumpId: '3',
            nozzleId: '2',
          },
        },
        taxes: [{ type: 'A', rate: 18, base: 7055.08, amount: 1269.92 }],
      },
    ],
    totals: { net: 7055.08, tax: 1269.92, amount: 8325, discount: 0 },
    countryCode: 'TZ',
    tanzania: {
      invoiceNumber: 'INV-2026/08/05-03',
      rctVerificationNum: 'F1D845133',
      zNumber: '20260811',
      dailyCounter: 1,
      globalCounter: 133,
      invoiceDate: '2026-08-11T13:04:16.649+03:00',
      custIdType: '6',
      custId: '',
      custName: 'Walk In',
      custMobile: '',
      issuedBy: 'John',
      isPosted: true,
      exchangeRate: 1,
      payments: [{ paymentMode: 'EMONEY', amount: 8325 }],
    },
  }

  const payload = toCountrySpecificInvoicePayload(invoice) as any
  assert.equal('deviceId' in payload, false)
  assert.equal(payload.countryCode, 'TZ')
  assert.deepEqual(payload.tanzania, invoice.tanzania)
  assert.equal(payload.lines[0].product.priceExtension, 8325)
  assert.equal(payload.lines[0].product.netTotal, 7055.08)
  assert.deepEqual(payload.lines[0].product.fuel, {
    gradeName: 'Diesel',
    tankId: '1',
    tankVolume: 34960,
    pumpId: '3',
    nozzleId: '2',
  })
  assert.deepEqual(payload.lines[0].taxes, [
    { type: 'A', rate: 18, base: 7055.08, amount: 1269.92 },
  ])
  assert.deepEqual(payload.totals, {
    net: 7055.08,
    tax: 1269.92,
    amount: 8325,
    discount: 0,
  })
})

test('non-Tanzania proxy payload retains the existing invoice contract', () => {
  const invoice: ProxyInvoiceRequest = {
    documentId: 'transaction-ke-1',
    documentNumber: 'INV-KE-1',
    documentType: 'INVOICE',
    issueDateTime: '2026-08-04T10:30:00.000+03:00',
    currency: 'KES',
    createdByName: 'Jane',
    countryCode: 'KE',
    lines: [
      {
        lineId: '1',
        lineType: 'ITEM',
        product: {
          productId: 'product-1',
          productCode: 'P001',
          description: 'Product',
          quantity: 1,
          unitPrice: 100,
          priceExtension: 100,
          netTotal: 100,
        },
        taxes: [{ type: 'A', rate: 16, base: 100, amount: 16 }],
      },
    ],
    totals: { net: 100, tax: 16, amount: 116, discount: 0 },
  }

  const payload = toCountrySpecificInvoicePayload(invoice) as any
  assert.equal(payload.DocumentId, 'transaction-ke-1')
  assert.ok(Array.isArray(payload.Lines))
  assert.equal(payload.Lines[0].product.description, 'Product')
  assert.deepEqual(payload.Lines[0].taxes, [{ type: 'A', rate: 16 }])
  assert.equal('deviceId' in payload, false)
  assert.equal('documentId' in payload, false)
  assert.equal('lines' in payload, false)
  assert.equal('countryCode' in payload, false)
  assert.equal('tanzania' in payload, false)
  assert.equal('totals' in payload, false)
})

test('Tanzania country aliases activate the Tanzania fiscal path', () => {
  assert.equal(isTanzaniaCountry('TZ'), true)
  assert.equal(isTanzaniaCountry('TZA'), true)
  assert.equal(isTanzaniaCountry('Tanzania'), true)
  assert.equal(isTanzaniaCountry('United Republic of Tanzania'), true)
  assert.equal(isTanzaniaCountry('KE'), false)
  assert.equal(normalizeFiscalCountryCode('Tanzania'), 'TZ')
  assert.equal(normalizeFiscalCountryCode('Kenya'), 'KE')
  assert.equal(normalizeFiscalCountryCode('KEN'), 'KE')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import { toCountrySpecificInvoicePayload } from '@/src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload'
import { serializeFiscalProxyInvoiceForComparison } from '@/src/modules/fiscalization/application/proxyInvoiceParity'

const kenya: ProxyInvoiceRequest = {
  countryCode: 'KE',
  documentId: 'INV-KE-1',
  issueDateTime: '2026-10-19T09:10:00.000Z',
  currency: 'KES',
  createdByName: 'Operator',
  buyer: { pin: 'P1234' },
  lines: [{
    lineType: 'FuelSale',
    lineId: '1',
    product: {
      productId: 'PRD-1',
      productCode: 'KE2TYL0000001',
      productClassCode: '9901300102',
      productTypeCode: '2',
      description: 'Petrol',
      unitOfMeasure: 'L',
      unitOfPackaging: 'TY',
      quantity: 10,
      unitPrice: 183,
      priceExtension: 1830,
      netTotal: 1577.59,
      hazardousIndicator: true,
      fuel: { gradeId: '1', tankId: '1', pumpId: '2' },
    },
    taxes: [{ type: 'B', rate: 16, base: 1577.59, amount: 252.41 }],
  }],
  payment: { tenders: [{ method: 'MobileMoney', amount: 1830 }] },
}

const tanzania: ProxyInvoiceRequest = {
  countryCode: 'TZ',
  documentId: 'TZ-2026-100',
  documentNumber: '0100',
  documentType: 'Invoice',
  issueDateTime: '2026-10-19T10:00:00.000Z',
  currency: 'TZS',
  createdByName: 'Operator',
  isOnline: false,
  lines: [{
    lineType: 'FuelSale',
    lineId: '1',
    product: {
      productId: '123', productCode: 'G1', description: 'Diesel',
      quantity: 20, unitPrice: 2000, netTotal: 40000,
      priceExtension: 47200, commodityCode: 'DIESEL',
      fuel: { gradeId: '1', tankId: '2', tankVolume: 340 },
    },
    taxes: [{ type: 'A', rate: 18, base: 40000, amount: 7200 }],
    discounts: [{ amount: 10 }],
  }],
  totals: { net: 40000, tax: 7200, amount: 47200 },
  payment: { tenders: [{ method: 'Cash', amount: 47200 }] },
  notes: 'offline transaction',
  tanzania: {
    invoiceNumber: '0100',
    rctVerificationNum: 'VERIFY',
    zNumber: 'Z100',
    dailyCounter: 100,
    globalCounter: 1000,
    invoiceDate: '2026-10-19T12:00:00+03:00',
    custIdType: '0',
    exchangeRate: 1,
    payments: [{ paymentMode: 'CASH', amount: 47200 }],
  },
}

test('Kenya proxy DTO serializer exactly matches existing country serializer', () => {
  assert.deepEqual(
    serializeFiscalProxyInvoiceForComparison('KE', kenya),
    toCountrySpecificInvoicePayload(kenya),
  )
})

test('Tanzania proxy DTO serializer preserves fiscal counters, totals and timestamps', () => {
  const actual = serializeFiscalProxyInvoiceForComparison('TZA', tanzania)
  assert.deepEqual(actual, toCountrySpecificInvoicePayload(tanzania))
  assert.equal((actual['tanzania'] as { invoiceDate: string }).invoiceDate, '2026-10-19T12:00:00')
})

test('unsupported country and country mismatch fail closed', () => {
  assert.throws(() => serializeFiscalProxyInvoiceForComparison('XX', kenya), /Unsupported/)
  assert.throws(() => serializeFiscalProxyInvoiceForComparison('TZ', kenya), /does not match/)
})

test('missing optional invoice fields follow existing compact rules', () => {
  const invoice: ProxyInvoiceRequest = {
    countryCode: 'KE', issueDateTime: '2026-10-19T09:00:00Z',
    lines: [{ product: { quantity: 1 }, taxes: [] }],
  }
  assert.deepEqual(
    serializeFiscalProxyInvoiceForComparison('KE', invoice),
    toCountrySpecificInvoicePayload(invoice),
  )
})

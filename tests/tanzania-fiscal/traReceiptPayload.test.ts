import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTraReceiptItemsFromTransaction,
  buildTraReceiptPayloadString,
  buildTraReceiptPayments,
  buildTraReceiptTotals,
  buildTraReceiptVatTotals,
  getTraReceiptVerificationNo,
  normalizeTraPaymentType,
  normalizeTraTaxCode,
  resolveTraReceiptEndpoint,
  traTaxCodeNumber,
} from '../../src/modules/tanzania-fiscal/infrastructure/traReceipt'

test('builds package-compatible TRA receipt endpoint and verification number', () => {
  assert.equal(
    resolveTraReceiptEndpoint('https://vfd.tra.go.tz'),
    'https://vfd.tra.go.tz/api/efdmsRctInfo',
  )
  assert.equal(
    resolveTraReceiptEndpoint('https://vfd.tra.go.tz/vfdtoken'),
    'https://vfd.tra.go.tz/api/efdmsRctInfo',
  )
  assert.equal(getTraReceiptVerificationNo('2E9LT6', 36), '2E9LT636')
})

test('normalizes TRA receipt tax and payment values', () => {
  assert.equal(normalizeTraTaxCode('1'), 'A')
  assert.equal(normalizeTraTaxCode('b'), 'B')
  assert.equal(traTaxCodeNumber('A'), 1)
  assert.equal(traTaxCodeNumber('E'), 5)
  assert.equal(normalizeTraPaymentType('credit-card'), 'CCARD')
  assert.equal(normalizeTraPaymentType('mobile money'), 'EMONEY')
  assert.equal(normalizeTraPaymentType('account'), 'INVOICE')
})

test('builds item, payment, total, and VAT records for a receipt payload', () => {
  const transaction = {
    payment_type: 'card',
    lines: [
      {
        id: 'fuel-1',
        product_name: 'Diesel 50ppm',
        quantity: 12.5,
        unit_price: 1000,
        line_total: 12500,
        tax_code: 'A',
      },
    ],
  }

  const items = buildTraReceiptItemsFromTransaction(transaction)
  const vatTotals = buildTraReceiptVatTotals({ items, vatRate: 0.18 })
  const totals = buildTraReceiptTotals({ items, vatTotals })
  const payments = buildTraReceiptPayments({
    transaction,
    amount: items.reduce((acc, item) => acc + item.price, 0),
  })

  assert.equal(items[0]!.description, 'Diesel 50ppm')
  assert.equal(items[0]!.taxCode, 'A')
  assert.equal(payments[0]!.type, 'CCARD')
  assert.equal(totals.totalIncludingTax, '12500.00')
  assert.equal(vatTotals[0]!.vatRateText, 'A-18.00')

  const xml = buildTraReceiptPayloadString({
    date: '2026-07-08',
    time: '13:45:01',
    znum: '20260708',
    receiptNo: 36,
    dailyCount: 2,
    globalCount: 36,
    receiptVerificationNo: '2E9LT636',
    config: {
      taxIdNo: '123456789',
      vfdRegId: 'TZ0100082639',
      vfdSerialNo: '10TZ107372',
      receiptCode: '2E9LT6',
      customerIdType: '6',
    },
    items,
    totals,
    payments,
    vatTotals,
  })

  assert.match(xml, /<RCT>/)
  assert.match(xml, /<RCTVNUM>2E9LT636<\/RCTVNUM>/)
  assert.match(xml, /<TAXCODE>1<\/TAXCODE>/)
  assert.match(xml, /<PMTTYPE>CCARD<\/PMTTYPE>/)
  assert.match(xml, /<VATRATE>A<\/VATRATE>/)
})

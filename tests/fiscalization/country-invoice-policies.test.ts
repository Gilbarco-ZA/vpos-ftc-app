import assert from 'node:assert/strict'
import test from 'node:test'
import { getCountryInvoicePolicy } from '@/src/modules/fiscalization/application/invoicePolicyRegistry'
import type { CanonicalInvoice } from '@/src/modules/fiscalization/domain/countryAdapter'

const kenyaInvoice: CanonicalInvoice = {
  documentId: 'INV-KE-01',
  issuedAt: '2026-10-19T09:00:00.000Z',
  currency: 'KES',
  lines: [{
    product: {
      id: 'PRD-1', code: 'KE2TYL0000001', name: 'Petrol 93',
      classCode: '9901300102', typeCode: '2', price: 183,
      currency: 'KES', taxCode: 'B', unitOfMeasure: 'L',
      unitOfPackaging: 'TY', hazardousIndicator: true,
    },
    quantity: 2, unitPrice: 183, taxRate: 16,
    fuel: { gradeId: '10', gradeName: 'Petrol 93' },
  }],
  tenders: [{ method: '06', amount: 100 }, { method: 'Cash', amount: 266 }],
}

test('Kenya invoice serializes multiple tenders using proxy casing', () => {
  const payload = getCountryInvoicePolicy('KE').buildPayload(kenyaInvoice) as any
  assert.equal(payload.DocumentId, 'INV-KE-01')
  assert.equal(payload.Currency, 'KES')
  assert.equal(payload.Lines[0].product.unitOfPackaging, 'TY')
  assert.deepEqual(payload.Payment.Tenders, [
    { Method: 'MobileMoney', Amount: 100 },
    { Method: 'Cash', Amount: 266 },
  ])
})

test('Kenya rejects unsupported payment and total mismatches', () => {
  const policy = getCountryInvoicePolicy('KENYA')
  assert.equal(policy.validate({ ...kenyaInvoice, tenders: [{ method: 'bitcoin', amount: 366 }] }).valid, false)
  assert.equal(policy.validate({ ...kenyaInvoice, tenders: [{ method: 'CASH', amount: 1 }] }).valid, false)
})

test('Tanzania refuses missing enrichment and preserves local timestamp', () => {
  const policy = getCountryInvoicePolicy('TZ')
  const invoice: CanonicalInvoice = {
    ...kenyaInvoice, currency: 'TZS', tenders: [],
    lines: kenyaInvoice.lines.map(line => ({
      ...line, product: {
        ...line.product, classCode: 'FUEL', typeCode: 'PETROL',
        taxCode: 'A', currency: 'TZS',
      }, taxRate: 18,
    })),
  }
  assert.equal(policy.validate(invoice).valid, false)
  const payload = policy.buildPayload({
    ...invoice,
    metadata: { tanzania: { fiscalDevice: 'test' } },
  }) as any
  assert.equal(payload.countryCode, 'TZ')
  assert.equal(payload.issueDateTime, '2026-10-19T09:00:00.000')
  assert.equal(payload.tanzania.invoiceDate, payload.issueDateTime)
})

test('unknown country cannot inherit another invoice policy', () => {
  assert.throws(() => getCountryInvoicePolicy('ZZ'), /Unsupported fiscalization country/)
})

test('Tanzania preserves authoritative tax, discounts and offline totals', () => {
  const policy = getCountryInvoicePolicy('TZ')
  const invoice: CanonicalInvoice = {
    documentId: 'TZ-AUTH-1',
    issuedAt: '2026-10-19T11:00:00.000Z',
    currency: 'TZS',
    isOnline: false,
    notes: 'Offline recovery',
    lines: [{
      product: {
        id: '1', code: 'G1', name: 'Diesel', classCode: 'FUEL',
        typeCode: 'DIESEL', price: 118, currency: 'TZS', taxCode: 'A',
      },
      quantity: 2, unitPrice: 100,
      lineId: 'fuel-1', lineType: 'FuelSale',
      priceExtension: 236, netTotal: 200,
      taxes: [{ type: 'A', rate: 18, base: 200, amount: 36 }],
      discounts: [{ amount: 2 }],
      commodityCode: '271019',
    }],
    tenders: [{ method: 'Cash', amount: 236 }],
    totals: { priceExtension: 238, discount: 2, net: 200, tax: 36, amount: 236 },
    metadata: { tanzania: { invoiceNumber: '100', dailyCounter: 10 } },
  }
  const payload = policy.buildPayload(invoice) as {
    isOnline: boolean
    totals: { amount: number; discount: number }
    lines: Array<{
      lineId: string
      discounts: unknown[]
      taxes: Array<{ base: number; amount: number }>
      product: { priceExtension: number; netTotal: number; commodityCode: string | null }
    }>
    notes: string | null
  }
  assert.equal(payload.isOnline, false)
  assert.equal(payload.totals.amount, 236)
  assert.equal(payload.totals.discount, 2)
  assert.equal(payload.lines[0].lineId, 'fuel-1')
  assert.equal(payload.lines[0].product.priceExtension, 236)
  assert.equal(payload.lines[0].product.netTotal, 200)
  assert.equal(payload.lines[0].product.commodityCode, '271019')
  assert.equal(payload.lines[0].taxes[0].amount, 36)
  assert.deepEqual(payload.lines[0].discounts, [{ amount: 2 }])
  assert.equal(payload.notes, 'Offline recovery')
})

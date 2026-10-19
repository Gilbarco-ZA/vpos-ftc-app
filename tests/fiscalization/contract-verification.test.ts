import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import { compareProxyInvoiceContracts } from '@/src/modules/fiscalization/application/contractVerification'
import { assessFiscalLayerReadiness } from '@/src/modules/fiscalization/application/fiscalLayerReadiness'

const cases: Array<{ country: 'KE' | 'TZ'; name: string; invoice: ProxyInvoiceRequest }> = [
  {
    country: 'KE',
    name: 'split tender, fuel and nonfuel',
    invoice: {
      countryCode: 'KE', documentId: 'KE-001', issueDateTime: '2026-10-19T12:00:00Z', currency: 'KES',
      lines: [
        { lineType: 'Sale', product: { productId: '1', productCode: 'G1', quantity: 2, unitPrice: 100,
          unitOfMeasure: 'L', unitOfPackaging: 'TY', fuel: { gradeId: '1', tankId: '2' } },
          taxes: [{ type: 'B', rate: 16 }] },
        { lineType: 'Sale', product: { productId: '2', productCode: 'SNACK', quantity: 1, unitPrice: 50 },
          taxes: [{ type: 'A', rate: 0 }] },
      ],
      payment: { tenders: [{ method: 'Cash', amount: 150 }, { method: 'Card', amount: 100 }] },
    },
  },
  {
    country: 'TZ',
    name: 'enriched offline fiscal invoice',
    invoice: {
      countryCode: 'TZ', documentId: 'TZ-001', issueDateTime: '2026-10-19T09:00:00Z', currency: 'TZS',
      isOnline: false, documentNumber: 'F00001',
      lines: [{ lineType: 'Sale', lineId: '1',
        product: { productId: '1', productCode: 'G1', quantity: 10, unitPrice: 2000,
          priceExtension: 23600, netTotal: 20000, fuel: { gradeId: '1', tankVolume: 300 } },
        taxes: [{ type: 'A', rate: 18, base: 20000, amount: 3600 }],
        discounts: [{ amount: 0 }],
      }],
      totals: { net: 20000, tax: 3600, amount: 23600 },
      payment: { tenders: [{ method: 'Cash', amount: 23600 }] },
      tanzania: { invoiceNumber: 'F00001', rctVerificationNum: 'V100',
        zNumber: 'Z1', dailyCounter: 1, globalCounter: 101,
        invoiceDate: '2026-10-19T12:00:00+03:00', custIdType: '0',
        exchangeRate: 1, payments: [{ paymentMode: 'CASH', amount: 23600 }] },
    },
  },
]

for (const fixture of cases) {
  test(fixture.country + ' local serializer parity: ' + fixture.name, () => {
    const result = compareProxyInvoiceContracts(fixture.country, fixture.invoice)
    assert.equal(result.matches, true, JSON.stringify(result.differences, null, 2))
    assert.deepEqual(result.differences, [])
    assert.equal(result.remoteContractVerified, false)
  })
}

test('local shape parity never promotes runtime readiness', () => {
  assert.equal(assessFiscalLayerReadiness('KE').readyForProduction, false)
  assert.equal(assessFiscalLayerReadiness('TZ').readyForProduction, false)
})

test('unknown fiscal country is rejected', () => {
  assert.throws(() => compareProxyInvoiceContracts('XX', cases[0].invoice), /Unsupported/)
})

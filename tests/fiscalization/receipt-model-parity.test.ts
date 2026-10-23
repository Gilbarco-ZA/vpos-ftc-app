import assert from 'node:assert/strict'
import test from 'node:test'
import type { FiscalReceiptModel } from '@/src/shared/fiscalization/receipt/types'
import { buildReceiptLines as buildKenyaLines } from '@/src/shared/fiscalization/receipt/templates/KE'
import { buildReceiptLines as buildTanzaniaLines } from '@/src/shared/fiscalization/receipt/templates/TZ'
import { getCountryReceiptPolicy } from '@/src/modules/fiscalization/application/receiptPolicyRegistry'

function fixture(country: 'KE' | 'TZ'): FiscalReceiptModel {
  return {
    station: {
      name: 'TEST FUEL SITE', country, taxId: 'TEST-TIN',
      vrn: 'TEST-VRN', serial: 'SERIAL-1', mobile: '00000000',
    },
    transaction: {
      date: '2026-10-19T12:00:00', invoiceNo: 'INV-100',
      fiscalReference: 'REF-100', receiptDate: '2026-10-19',
      receiptTime: '12:00:00', pumpNumber: '1', nozzleNumber: '2',
    },
    customer: { name: 'Test Customer', tin: 'TEST-TIN' },
    items: [{
      name: 'Diesel', productCode: 'G1', taxCode: 'A',
      quantity: 10, unitPrice: 2000, amount: 20000,
      taxRate: 18, taxAmount: 3050.85,
    }],
    taxSummary: [{
      taxCode: 'A', label: 'VAT', rate: 18,
      taxableAmount: 16949.15, taxAmount: 3050.85,
    }],
    payment: {
      method: 'Cash', amount: 20000, itemsCount: 1,
      currency: country === 'KE' ? 'KES' : 'TZS',
    },
    fiscalMeta: {
      receiptNumber: 'R-100', traReceiptNumber: 'TRA-100',
      dailyCount: '10', globalCount: '100', zNumber: 'Z-1',
      verificationCode: 'VERIFY-100', verificationUrl: 'https://example.invalid/verify',
      signature: 'TEST-SIGNATURE',
    },
    qrPayload: { data: 'https://example.invalid/verify' },
    decimals: { money: 2, volume: 2, unitPrice: 2 },
  }
}

for (const country of ['KE', 'TZ'] as const) {
  test(country + ' receipt adapter matches existing enriched template output', () => {
    const model = fixture(country)
    const current = country === 'KE' ? buildKenyaLines(model) : buildTanzaniaLines(model)
    const candidate = getCountryReceiptPolicy(country).render(model)
    assert.deepEqual(candidate, current)
    assert.ok(candidate.length > 0)
  })
}

test('Tanzania receipt model retains verification and counter fields', () => {
  const model = fixture('TZ')
  const rendered = getCountryReceiptPolicy('TZ').render(model)
  assert.ok(rendered.length > 0)
  assert.equal(model.fiscalMeta.dailyCount, '10')
  assert.equal(model.fiscalMeta.globalCount, '100')
  assert.equal(model.fiscalMeta.verificationCode, 'VERIFY-100')
})

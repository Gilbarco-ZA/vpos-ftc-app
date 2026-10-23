import assert from 'node:assert/strict'
import test from 'node:test'
import { invoiceExpectedAmount, validateFinancialIntegrity } from '@/src/modules/fiscalization/domain/financialValidation'
import type { CanonicalInvoice } from '@/src/modules/fiscalization/domain/countryAdapter'

const invoice: CanonicalInvoice = {
  documentId: 'A1', issuedAt: '2026-10-19T10:00:00Z', currency: 'TZS',
  lines: [{
    product: { id: '1', code: 'G1', name: 'Diesel', price: 118, currency: 'TZS' },
    quantity: 2, unitPrice: 118, priceExtension: 236, netTotal: 200,
    taxes: [{ type: 'A', rate: 18, base: 200, amount: 36 }],
  }],
  tenders: [{ method: 'Cash', amount: 236 }],
  totals: { priceExtension: 236, net: 200, tax: 36, amount: 236 },
}
test('authoritative amount wins over inferred unit price', () => {
  assert.equal(invoiceExpectedAmount(invoice), 236)
  assert.deepEqual(validateFinancialIntegrity(invoice), [])
})
test('mismatched tender and negative tax rejected', () => {
  const modified: CanonicalInvoice = {
    ...invoice, tenders: [{ method: 'Cash', amount: 235 }],
    lines: [{ ...invoice.lines[0], taxes: [{ type: 'A', rate: 18, amount: -1 }] }],
  }
  assert.deepEqual(validateFinancialIntegrity(modified).map(x => x.field),
    ['lines.0.taxes.0.amount', 'tenders'])
})
test('no authoritative totals falls back to persisted price extension', () => {
  assert.equal(invoiceExpectedAmount({ ...invoice, totals: undefined }), 236)
})

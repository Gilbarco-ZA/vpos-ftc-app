import assert from 'node:assert/strict'
import test from 'node:test'
import { mapTransactionToProxyInvoice } from '../../src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'

test('Kenya invoice prefers current product catalog classifications over stale transaction line', () => {
  const invoice = mapTransactionToProxyInvoice({
    transaction: {
      id: 'test-1',
      transaction_date_time: '2026-10-22T10:00:00Z',
      lines: [{
        productId: 'D1', productCode: 'OLD', productClassCode: 'OLD_CLASS',
        productTypeCode: 'OLD_TYPE', quantity: 1, unitPrice: 116, lineTotal: 116,
        taxCode: 'A', taxRate: 0,
      }],
    },
    station: { country: 'KE' },
    customer: null,
    vatRate: 16,
    taxType: 'B',
    taxRate: 16,
    enrichment: {
      productId: 'D1', productCode: 'FUEL',
      productClassCode: '9901300102', productTypeCode: '2',
      taxCode: 'B', taxRate: 16,
    },
  })
  assert.equal(invoice.lines?.[0]?.product?.productClassCode, '9901300102')
  assert.equal(invoice.lines?.[0]?.product?.productTypeCode, '2')
  assert.equal(invoice.lines?.[0]?.taxes?.[0]?.type, 'B')
  assert.equal(invoice.lines?.[0]?.taxes?.[0]?.rate, 16)
})

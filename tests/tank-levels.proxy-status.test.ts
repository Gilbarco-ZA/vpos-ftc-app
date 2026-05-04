import assert from 'node:assert/strict'
import test from 'node:test'

import { assessStockInProxyResponse } from '@/src/modules/tank-levels/infrastructure/proxyStockInResult'

test('assessStockInProxyResponse marks nested stockIn failures as failed', () => {
  const result = assessStockInProxyResponse({
    stockIn: [
      {
        documentId: null,
        status: 'Failed',
        responseCode: '1001',
        message: 'StockIn SC-MNY8N94I has missing fields - Taxes missing',
        error: true,
      },
    ],
    responseCode: '200',
    message: 'Success',
    error: true,
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /Taxes missing/)
})

test('assessStockInProxyResponse accepts successful stockIn responses', () => {
  const result = assessStockInProxyResponse({
    stockIn: [
      {
        documentId: 'DEL-123',
        status: 'Completed',
        responseCode: '200',
        message: 'Success',
        error: false,
      },
    ],
    responseCode: '200',
    message: 'Success',
    error: false,
  })

  assert.equal(result.ok, true)
})

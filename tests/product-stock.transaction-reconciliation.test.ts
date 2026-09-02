import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTransactionStockDeltas } from '@/src/modules/stock/domain/transactionStockReconciliation'

test('new POS lines create stock-out deltas', () => {
  assert.deepEqual(
    buildTransactionStockDeltas({
      target: [{ productRecordId: 'product-a', quantity: 5 }],
      applied: [],
    }),
    [
      {
        productRecordId: 'product-a',
        movementType: 'STOCK_OUT',
        quantity: 5,
      },
    ],
  )
})

test('reducing a non-fiscalized line creates a stock-in correction', () => {
  assert.deepEqual(
    buildTransactionStockDeltas({
      target: [{ productRecordId: 'product-a', quantity: 3 }],
      applied: [{ productRecordId: 'product-a', quantity: 5 }],
    }),
    [
      {
        productRecordId: 'product-a',
        movementType: 'STOCK_IN',
        quantity: 2,
      },
    ],
  )
})

test('increasing and removing lines produce only the required corrections', () => {
  assert.deepEqual(
    buildTransactionStockDeltas({
      target: [
        { productRecordId: 'product-a', quantity: 7 },
        { productRecordId: 'product-c', quantity: 2 },
      ],
      applied: [
        { productRecordId: 'product-a', quantity: 5 },
        { productRecordId: 'product-b', quantity: 4 },
      ],
    }),
    [
      {
        productRecordId: 'product-a',
        movementType: 'STOCK_OUT',
        quantity: 2,
      },
      {
        productRecordId: 'product-b',
        movementType: 'STOCK_IN',
        quantity: 4,
      },
      {
        productRecordId: 'product-c',
        movementType: 'STOCK_OUT',
        quantity: 2,
      },
    ],
  )
})

test('replaying the same final transaction state creates no delta', () => {
  assert.deepEqual(
    buildTransactionStockDeltas({
      target: [{ productRecordId: 'product-a', quantity: 2.125 }],
      applied: [{ productRecordId: 'product-a', quantity: 2.125 }],
    }),
    [],
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { isFuelLikeProduct } from '../../src/modules/transactions/domain/product-classification'
import {
  getTransactionItemEditability,
  isPumpRecordedFuelTransaction,
  isTransactionItemStatusEditable,
} from '../../src/modules/transactions/domain/transaction-editability'

test('DOMS pump transactions allow non-fuel edits while locking fuel items', () => {
  const transaction = {
    pump_number: 3,
    fuel_type: 'Diesel',
    doms_source_system: 'PSS5000',
  }

  assert.equal(isPumpRecordedFuelTransaction(transaction), true)
  assert.deepEqual(getTransactionItemEditability(transaction), {
    editable: true,
    fuelItemsLocked: true,
    reason:
      'Fuel items recorded by a forecourt pump are read-only. Non-fuel products may still be added, changed, or removed.',
    code: 'PUMP_RECORDED_FUEL_ITEMS_LOCKED',
  })
})

test('pump and fuel metadata identifies a pump-recorded fuel transaction', () => {
  assert.equal(
    isPumpRecordedFuelTransaction({ pumpNumber: 2, fuelType: 'Petrol 95' }),
    true,
  )
})

test('manual product transactions remain fully editable', () => {
  assert.deepEqual(
    getTransactionItemEditability({ pumpNumber: 0, fuelType: null }),
    {
      editable: true,
      fuelItemsLocked: false,
      reason: null,
      code: null,
    },
  )
})

test('fuel classification follows category before product-name heuristics', () => {
  assert.equal(
    isFuelLikeProduct({ productName: 'Diesel 50ppm', categoryName: 'Fuel' }),
    true,
  )
  assert.equal(
    isFuelLikeProduct({ productName: 'Super Glue', categoryName: 'Hardware' }),
    false,
  )
  assert.equal(isFuelLikeProduct({ productName: 'Unleaded 95' }), true)
  assert.equal(
    isFuelLikeProduct({ productName: 'Bread', categoryName: 'Supermarket' }),
    false,
  )
})


test('only pending non-fiscalized statuses allow item changes', () => {
  for (const status of ['OPEN', 'ALLOCATED', 'FAILED', 'PENDING']) {
    assert.equal(isTransactionItemStatusEditable(status), true)
  }

  for (const status of ['FISCALIZING', 'FISCALIZED', 'PRINTED', 'CREDITED']) {
    assert.equal(isTransactionItemStatusEditable(status), false)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { findPumpTransactionLineViolation } from '../../src/modules/transactions/domain/pump-transaction-line-policy'

const lockedFuelLine = {
  productId: 'fuel-product',
  quantity: 20,
  unitPrice: 25.5,
  isFuel: true,
}

test('allows non-fuel products to be added to a pump transaction', () => {
  const violation = findPumpTransactionLineViolation({
    existingFuelLines: [lockedFuelLine],
    requestedLines: [
      lockedFuelLine,
      {
        productId: 'coolant-product',
        quantity: 1,
        unitPrice: 80,
        isFuel: false,
      },
    ],
  })

  assert.equal(violation, null)
})

test('blocks changes to the pump-recorded fuel quantity or price', () => {
  const violation = findPumpTransactionLineViolation({
    existingFuelLines: [lockedFuelLine],
    requestedLines: [{ ...lockedFuelLine, quantity: 21 }],
  })

  assert.deepEqual(violation, {
    code: 'PUMP_RECORDED_FUEL_ITEM_IMMUTABLE',
    productId: 'fuel-product',
  })
})

test('blocks removal of the pump-recorded fuel product', () => {
  const violation = findPumpTransactionLineViolation({
    existingFuelLines: [lockedFuelLine],
    requestedLines: [lockedFuelLine],
    removedProductIds: ['fuel-product'],
  })

  assert.deepEqual(violation, {
    code: 'PUMP_RECORDED_FUEL_ITEM_IMMUTABLE',
    productId: 'fuel-product',
  })
})

test('blocks adding another fuel product', () => {
  const violation = findPumpTransactionLineViolation({
    existingFuelLines: [lockedFuelLine],
    requestedLines: [
      lockedFuelLine,
      {
        productId: 'second-fuel-product',
        quantity: 1,
        unitPrice: 27,
        isFuel: true,
      },
    ],
  })

  assert.deepEqual(violation, {
    code: 'PUMP_RECORDED_FUEL_ADDITION_BLOCKED',
    productId: 'second-fuel-product',
  })
})

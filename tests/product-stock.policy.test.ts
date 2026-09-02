import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateImportedStockAdjustment,
  isFuelCategory,
  isFuelProduct,
  stockMovementRequiresProxy,
} from '@/src/modules/stock/domain/stockMovement'

test('fuel products are excluded by category code', () => {
  assert.equal(
    isFuelCategory({ categoryCode: 'fuel', categoryName: 'Petroleum' }),
    true,
  )
})

test('fuel products are excluded by category name fallback', () => {
  assert.equal(
    isFuelCategory({ categoryCode: null, legacyCategory: ' Fuel ' }),
    true,
  )
})

test('fuel products are excluded by product class code', () => {
  assert.equal(
    isFuelProduct({
      categoryCode: 'GENERAL',
      categoryName: 'General merchandise',
      productClassCode: 'fuel',
    }),
    true,
  )
  assert.equal(
    isFuelProduct({ externalProductClassCode: ' FUEL ' }),
    true,
  )
})

test('fuel products are excluded by canonical fuel product type codes', () => {
  for (const productTypeCode of [
    'PETROL',
    'diesel',
    'Kerosene',
    'LPG',
    'CNG',
    'PMS',
    'AGO',
    'jet-fuel',
  ]) {
    assert.equal(isFuelProduct({ productTypeCode }), true, productTypeCode)
  }
  assert.equal(
    isFuelProduct({ externalProductTypeCode: ' diesel ' }),
    true,
  )
})

test('non-fuel and uncategorized products remain stock-manageable', () => {
  assert.equal(
    isFuelProduct({
      categoryCode: 'LUBRICANTS',
      categoryName: 'Lubricants',
      productClassCode: 'LUBE',
      productTypeCode: 'GOODS',
    }),
    false,
  )
  assert.equal(isFuelCategory({}), false)
})

test('normalized category identity takes precedence over the legacy label', () => {
  assert.equal(
    isFuelCategory({
      categoryCode: 'LUBRICANTS',
      categoryName: 'Lubricants',
      legacyCategory: 'Fuel',
    }),
    false,
  )
})

test('POS transaction movements stay local while manual and CSV movements use the proxy', () => {
  assert.equal(stockMovementRequiresProxy('POS_TRANSACTION'), false)
  assert.equal(stockMovementRequiresProxy('MANUAL'), true)
  assert.equal(stockMovementRequiresProxy('CSV_IMPORT'), true)
})

test('CSV SET and ADD modes calculate deterministic ledger deltas', () => {
  assert.deepEqual(
    calculateImportedStockAdjustment({
      previousQuantity: 4,
      stockQuantity: 10,
      stockUpdateMode: 'SET',
    }),
    {
      resultingQuantity: 10,
      movementType: 'STOCK_IN',
      movementQuantity: 6,
    },
  )
  assert.deepEqual(
    calculateImportedStockAdjustment({
      previousQuantity: 5,
      stockQuantity: 2,
      stockUpdateMode: 'SET',
    }),
    {
      resultingQuantity: 2,
      movementType: 'STOCK_OUT',
      movementQuantity: 3,
    },
  )
  assert.deepEqual(
    calculateImportedStockAdjustment({
      previousQuantity: 5,
      stockQuantity: 3,
      stockUpdateMode: 'ADD',
    }),
    {
      resultingQuantity: 8,
      movementType: 'STOCK_IN',
      movementQuantity: 3,
    },
  )
})

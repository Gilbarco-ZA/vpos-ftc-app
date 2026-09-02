import assert from 'node:assert/strict'
import test from 'node:test'

import { createStockMovementSchema } from '@/src/modules/stock/application/stockSchemas'

const base = {
  productRecordId: '5d9b51dd-e5d2-4c7d-8626-9385ad2b4a2d',
  movementType: 'STOCK_OUT',
  reason: 'Damaged',
  quantity: 2,
  unitCost: null,
  effectiveAt: '2026-08-03T10:00:00.000Z',
  documentReference: 'INV-7',
  remarks: null,
  supplierName: null,
  supplierPin: null,
  supplierInvoiceNumber: null,
}

test('stock-out requires a reference document', () => {
  const parsed = createStockMovementSchema.safeParse({
    ...base,
    documentReference: null,
  })
  assert.equal(parsed.success, false)
})

test('Other stock-out requires remarks', () => {
  const parsed = createStockMovementSchema.safeParse({
    ...base,
    reason: 'Other',
    remarks: null,
  })
  assert.equal(parsed.success, false)
})

test('stock-in rejects stock-out reasons', () => {
  const parsed = createStockMovementSchema.safeParse({
    ...base,
    movementType: 'STOCK_IN',
    reason: 'Damaged',
    documentReference: null,
  })
  assert.equal(parsed.success, false)
})

test('unit cost may be omitted and is normalized to null', () => {
  const { unitCost: _unitCost, ...withoutUnitCost } = base
  const parsed = createStockMovementSchema.safeParse(withoutUnitCost)
  assert.equal(parsed.success, true)
  if (parsed.success) assert.equal(parsed.data.unitCost, null)
})

test('proxy-bound references respect the cloud length limit', () => {
  const parsed = createStockMovementSchema.safeParse({
    ...base,
    documentReference: 'x'.repeat(46),
  })
  assert.equal(parsed.success, false)
})

test('current stock movement time is accepted', () => {
  const now = new Date()
  now.setSeconds(0, 0)
  const parsed = createStockMovementSchema.safeParse({
    ...base,
    effectiveAt: now.toISOString(),
  })
  assert.equal(parsed.success, true)
})

test('future-dated stock movements are rejected', () => {
  const parsed = createStockMovementSchema.safeParse({
    ...base,
    effectiveAt: '2099-01-01T00:00:00.000Z',
  })
  assert.equal(parsed.success, false)
})

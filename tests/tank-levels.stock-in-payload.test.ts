import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStockInPayloadForMovement } from '@/src/modules/tank-levels/application/createTankStockEntry'

test('buildStockInPayloadForMovement matches the cloud stockIn collection shape', () => {
  const payload = buildStockInPayloadForMovement({
    documentId: 'DEL-123',
    stockInType: 'Delivery',
    purchaseDate: '2026-04-13',
    supplierName: 'Acme Fuel',
    supplierPin: 'PIN123',
    supplierInvoiceNumber: 'inv-99',
    productId: 'prod-1',
    productCode: 'DIESEL',
    productClassCode: 'CLASS-A',
    productTypeCode: 'FUEL',
    description: 'Diesel tank delivery',
    quantityLitres: 5000,
    unitOfMeasure: 'LTR',
    unitOfPackaging: '00',
    unitPrice: 10.5,
    hazardousIndicator: true,
  }) as any

  assert.deepEqual(Object.keys(payload), ['stockIn'])
  assert.equal(Array.isArray(payload.stockIn), true)
  assert.equal(payload.stockIn.length, 1)

  const item = payload.stockIn[0]
  assert.equal(item.documentId, 'DEL-123')
  assert.equal(item.stockInType, 'Delivery')
  assert.equal(item.purchaseDate, '2026-04-13')
  assert.equal(item.supplierInvoiceNumber, 'INV-99')
  assert.equal(item.quantity, undefined)
  assert.equal(item.totalCost, undefined)

  assert.equal(item.items[0].product.productId, 'prod-1')
  assert.equal(item.items[0].product.productCode, 'DIESEL')
  assert.equal(item.items[0].product.quantity, 5000)
  assert.equal(item.items[0].product.priceExtension, 52500)
  assert.equal(item.items[0].product.netTotal, 52500)
})


test('buildStockInPayloadForMovement normalizes ISO timestamp purchase dates to date-only', () => {
  const payload = buildStockInPayloadForMovement({
    documentId: 'SC-456',
    stockInType: 'StockCount',
    purchase_date: '2026-04-13T14:32:06.517Z',
    productId: 'prod-1',
    productCode: 'DIESEL',
    description: 'Diesel stock count',
    quantity_litres: 1234,
  }) as any

  assert.equal(payload.stockIn[0].purchaseDate, '2026-04-13')
})


test('buildStockInPayloadForMovement normalizes delivery document ids to an int32-safe numeric string', () => {
  const payload = buildStockInPayloadForMovement({
    documentId: '1776155744245',
    stockInType: 'Delivery',
    purchaseDate: '2026-04-14',
    productId: 'prod-1',
    quantityLitres: 10,
  }) as any

  const documentId = payload.stockIn[0].documentId
  assert.match(documentId, /^\d+$/)
  assert.equal(Number.isSafeInteger(Number(documentId)), true)
  assert.equal(Number(documentId) <= 2147483647, true)
})


test('buildStockInPayloadForMovement derives taxes from the linked product tax profile', () => {
  const payload = buildStockInPayloadForMovement({
    documentId: '1776157574',
    stockInType: 'Delivery',
    purchaseDate: '2026-04-14',
    productId: 'prod-1',
    productCode: 'DIESEL',
    description: 'Diesel delivery',
    quantityLitres: 1000,
    unitPrice: 20.69,
    extTaxCode: 'VAT',
    taxRate: 0.16,
  }) as any

  const line = payload.stockIn[0].items[0]
  assert.deepEqual(line.taxes, [
    {
      type: 'VAT',
      rate: 16,
      base: 17836.21,
      amount: 2853.79,
    },
  ])
  assert.equal(line.product.unitPrice, 17.84)
  assert.equal(line.product.priceExtension, 17836.21)
  assert.equal(line.product.netTotal, 17836.21)
})

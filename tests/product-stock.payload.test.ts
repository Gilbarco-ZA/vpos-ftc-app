import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessStockProxyResponse,
  buildStockProxyPayload,
} from '@/src/modules/stock/infrastructure/stockPayload'

const baseSource = {
  id: '5d9b51dd-e5d2-4c7d-8626-9385ad2b4a2d',
  movementType: 'STOCK_IN' as const,
  reason: 'Delivery',
  documentId: 'STI-20260803-5D9B51DD',
  documentReference: null,
  remarks: 'Local audit remark',
  effectiveAt: '2026-08-03T10:00:00.000Z',
  createdByName: 'Manager',
  supplierName: 'Parts Supplier',
  supplierPin: 'PIN-1',
  supplierInvoiceNumber: 'INV-7',
  quantity: 10,
  unitCost: 116,
  productId: 'prod-1',
  productCode: 'OIL-5W30',
  productClassCode: 'LUBE',
  productTypeCode: 'GOODS',
  description: '5W30 Engine Oil',
  unitOfMeasure: 'EACH',
  unitOfPackaging: '00',
  hazardousIndicator: false,
  taxCode: 'VAT',
  taxRate: 0.16,
}

test('stock-in payload uses the existing vpos-proxy stockIn contract', () => {
  const payload = buildStockProxyPayload(baseSource)

  assert.equal(payload.path, '/api/stockin')
  if (payload.responseKey !== 'stockIn') assert.fail('Expected stock-in payload')
  assert.deepEqual(Object.keys(payload.body), ['stockIn'])

  const document = payload.body.stockIn[0]
  assert.equal(document.documentId, 'STI-20260803-5D9B51DD')
  assert.equal(document.stockInType, 'Delivery')
  assert.equal(document.purchaseDate, '2026-08-03T10:00:00.000Z')
  assert.equal(document.supplierInvoiceNumber, 'INV-7')
  assert.equal('reason' in document, false)
  assert.equal('notes' in document, false)

  const line = document.items[0]
  assert.equal(line.product.quantity, 10)
  assert.equal(line.product.netTotal, 1000)
  assert.deepEqual(line.taxes, [
    { type: 'VAT', rate: 16, base: 1000, amount: 160 },
  ])
})

test('stock-out payload uses documentReference and stockAdjustmentType', () => {
  const payload = buildStockProxyPayload({
    ...baseSource,
    movementType: 'STOCK_OUT',
    reason: 'Damaged',
    documentId: 'STO-20260803-5D9B51DD',
    documentReference: 'DAMAGE-104',
  })

  assert.equal(payload.path, '/api/stockout')
  if (payload.responseKey !== 'stockOut') assert.fail('Expected stock-out payload')
  const document = payload.body.stockOut[0]
  assert.equal(document.documentReference, 'DAMAGE-104')
  assert.equal(document.stockAdjustmentType, 'Damaged')
  assert.equal(document.remarks, 'Local audit remark')
  assert.equal(document.purchaseDate, '2026-08-03T10:00:00.000Z')
  assert.equal('stockOutType' in document, false)
  assert.equal('reason' in document, false)
  assert.equal('notes' in document, false)
})

test('business failures in stock responses are not treated as successful', () => {
  const result = assessStockProxyResponse(
    {
      stockOut: [
        {
          status: 'Failed',
          error: true,
          message: 'Insufficient stock',
        },
      ],
    },
    'stockOut',
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Insufficient stock')
})

test('non-success response codes are treated as proxy failures', () => {
  const result = assessStockProxyResponse(
    { responseCode: '422', message: 'Invalid stock type' },
    'stockIn',
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Invalid stock type')
})

test('cloud identifier limits are enforced before transmission', () => {
  assert.throws(
    () =>
      buildStockProxyPayload({
        ...baseSource,
        productId: 'x'.repeat(46),
      }),
    /Product ID exceeds the cloud limit/,
  )
})

test('plural and nested proxy failure collections are detected', () => {
  const result = assessStockProxyResponse(
    {
      success: true,
      data: {
        stockOuts: [
          {
            status: 'Rejected',
            message: 'Adjustment was rejected',
          },
        ],
      },
    },
    'stockOut',
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Adjustment was rejected')
})

test('failure flags on a proxy response envelope are detected', () => {
  const result = assessStockProxyResponse(
    {
      success: false,
      message: 'Proxy pipeline failed',
      data: { stockIn: [] },
    },
    'stockIn',
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Proxy pipeline failed')
})

test('CSV stock reductions use an auditable Stock Count adjustment', () => {
  const payload = buildStockProxyPayload({
    ...baseSource,
    movementType: 'STOCK_OUT',
    reason: 'Stock Count',
    documentId: 'STO-20260803-CSV00001',
    documentReference: 'CSV-20260803-ABC12345',
    remarks: 'CSV product import SET stock adjustment.',
  })

  if (payload.responseKey !== 'stockOut') assert.fail('Expected stock-out payload')
  const document = payload.body.stockOut[0]
  assert.equal(document.stockAdjustmentType, 'Stock Count')
  assert.equal(document.documentReference, 'CSV-20260803-ABC12345')
  assert.equal(document.remarks, 'CSV product import SET stock adjustment.')
})

test('CSV stock increases create valid stock-in updates', () => {
  const payload = buildStockProxyPayload({
    ...baseSource,
    movementType: 'STOCK_IN',
    reason: 'Stock Count',
    documentId: 'STI-20260803-CSV00002',
    documentReference: 'CSV-20260803-ABC12345',
    supplierName: null,
    supplierPin: null,
    supplierInvoiceNumber: null,
  })

  if (payload.responseKey !== 'stockIn') assert.fail('Expected stock-in payload')
  const document = payload.body.stockIn[0]
  assert.equal(document.stockInType, 'Stock Count')
  assert.equal(document.supplierInvoiceNumber, 'STI-20260803-CSV00002')
})

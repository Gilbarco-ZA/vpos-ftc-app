import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildKenyaProductRegistrationPayload,
} from '@/src/modules/products/application/services/product-service'

test('Kenya product registration uses the products contract, not invoice lines', () => {
  const rows = [
    ['PRD-1', 'KE2TYL0000001', '9901300102', 'Petrol 93', 183],
    ['PRD-2', 'KE2TYL0000002', '9901300103', 'Petrol 95', 185],
    ['PRD-3', 'KE2TYL0000003', '9901300102', 'Diesel 50', 180],
  ] as const

  const payload = {
    products: rows.map(([productId, productCode, productClassCode, productName, unitPrice]) =>
      buildKenyaProductRegistrationPayload({
        createdByName: 'Test User',
        isOnline: true,
        productId,
        productCode,
        productClassCode,
        productTypeCode: '2',
        productName,
        unitOfMeasure: 'L',
        unitOfPackaging: 'TY',
        unitPrice,
        currency: 'KES',
        taxCode: 'B',
        hazardousIndicator: true,
        unitCost: 0,
        taxRate: 16,
      }),
    ),
  }

  assert.deepEqual(payload, {
    products: [
      {
        createdByName: 'Test User',
        productId: 'PRD-1',
        productCode: 'KE2TYL0000001',
        productClassCode: '9901300102',
        productTypeCode: '2',
        productName: 'Petrol 93',
        unitOfMeasure: 'L',
        unitOfPackaging: 'TY',
        unitPrice: 183,
        currency: 'KES',
        taxCode: 'B',
        hazardousIndicator: true,
      },
      {
        createdByName: 'Test User',
        productId: 'PRD-2',
        productCode: 'KE2TYL0000002',
        productClassCode: '9901300103',
        productTypeCode: '2',
        productName: 'Petrol 95',
        unitOfMeasure: 'L',
        unitOfPackaging: 'TY',
        unitPrice: 185,
        currency: 'KES',
        taxCode: 'B',
        hazardousIndicator: true,
      },
      {
        createdByName: 'Test User',
        productId: 'PRD-3',
        productCode: 'KE2TYL0000003',
        productClassCode: '9901300102',
        productTypeCode: '2',
        productName: 'Diesel 50',
        unitOfMeasure: 'L',
        unitOfPackaging: 'TY',
        unitPrice: 180,
        currency: 'KES',
        taxCode: 'B',
        hazardousIndicator: true,
      },
    ],
  })
})

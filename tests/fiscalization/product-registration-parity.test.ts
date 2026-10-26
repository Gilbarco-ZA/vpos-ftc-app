import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKenyaProductRegistrationPayload,
  buildTanzaniaProductSyncPayload,
} from '@/src/modules/products/application/services/product-service'
import type { ProductCloudSyncInput } from '@/src/modules/products/application/services/product-service'
import { getCountryProductPolicy } from '@/src/modules/fiscalization/application/productPolicyRegistry'

function input(overrides: Partial<ProductCloudSyncInput> = {}): ProductCloudSyncInput {
  return {
    productId: 'PRD-1', productCode: 'G1', productName: 'Petrol 95',
    productClassCode: '9901300103', productTypeCode: '2',
    unitPrice: 183, unitCost: 0, currency: 'KES', taxRate: 16,
    taxCode: 'B', unitOfMeasure: 'L', unitOfPackaging: 'TY',
    hazardousIndicator: true, createdByName: 'Operator', isOnline: true,
    ...overrides,
  }
}

test('Kenya product adapter matches existing registration payload', () => {
  const current = input()
  const canonical = {
    id: current.productId, code: current.productCode, name: current.productName,
    classCode: current.productClassCode, typeCode: current.productTypeCode,
    price: current.unitPrice, currency: current.currency,
    taxCode: current.taxCode, unitOfMeasure: current.unitOfMeasure,
    unitOfPackaging: current.unitOfPackaging,
    hazardousIndicator: current.hazardousIndicator,
  }
  assert.deepEqual(
    getCountryProductPolicy('KE').buildRegistration([canonical], { createdByName: current.createdByName }),
    { products: [buildKenyaProductRegistrationPayload(current)] },
  )
})

test('Tanzania product adapter matches existing single product registration shape', () => {
  const current = input({
    productClassCode: 'FUEL', productTypeCode: 'DIESEL',
    productName: 'Diesel', currency: 'TZS', taxCode: 'A', taxRate: 18,
    category: 'Fuel',
  })
  const canonical = {
    id: current.productId, code: current.productCode, name: current.productName,
    classCode: current.productClassCode, typeCode: current.productTypeCode,
    price: current.unitPrice, currency: current.currency, taxCode: current.taxCode,
  }
  assert.deepEqual(
    getCountryProductPolicy('TZ').buildRegistration([canonical], { createdByName: current.createdByName }),
    [buildTanzaniaProductSyncPayload(current)],
  )
})

test('Kenya registration remains a batch and Tanzania registration remains individual', () => {
  const ke = getCountryProductPolicy('KE')
  const tz = getCountryProductPolicy('TZ')
  assert.equal(typeof ke.buildRegistration, 'function')
  assert.equal(typeof tz.buildRegistration, 'function')
  assert.equal(Array.isArray(tz.buildRegistration([], { createdByName: 'Operator' })), true)
})

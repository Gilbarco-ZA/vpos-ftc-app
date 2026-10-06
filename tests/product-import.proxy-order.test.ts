import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildProxyProductPayload } from '@/src/modules/products/application/services/product-service'

const source = readFileSync(
  'src/modules/products/application/importProductsCsv.ts',
  'utf8',
)

test('CSV import sends products before dependent stock movements', () => {
  const productSyncIndex = source.indexOf('syncProductsToCloudService({')
  const stockSyncIndex = source.indexOf('syncStockMovementsIndependently(')

  assert.ok(productSyncIndex >= 0)
  assert.ok(stockSyncIndex > productSyncIndex)
  assert.ok(source.includes('const stockSync = productSync.ok'))
})

test('product proxy payload prefers ext_* cloud fields and matches proxy contract', () => {
  const payload = buildProxyProductPayload({
    productId: 'local-4',
    productCode: 'LOCAL-G4',
    productName: 'Local diesel name',
    productClassCode: 'LOCAL_CLASS',
    productTypeCode: 'LOCAL_TYPE',
    unitPrice: 999,
    unitCost: 0,
    currency: 'LOCAL',
    taxRate: 0,
    category: 'Fuel',
    taxCode: 'LOCAL_TAX',
    hazardousIndicator: false,
    extProductId: '4',
    extProductCode: 'G4',
    extProductClassCode: 'FUEL',
    extProductTypeCode: 'FUEL',
    extDescription: 'Diesel 50',
    extUnitPrice: 206.9,
    extCurrency: 'TZS',
    extTaxCode: 'E',
    extHazardousIndicator: true,
    createdByName: 'Administrator',
    isOnline: false,
  })

  assert.equal(payload.productId, '4')
  assert.equal(payload.productCode, 'G4')
  assert.equal(payload.productClassCode, 'FUEL')
  assert.equal(payload.productTypeCode, 'FUEL')
  assert.equal(payload.productName, 'Diesel 50')
  assert.equal(payload.category, 'Fuel')
  assert.equal(payload.unitPrice, 206.9)
  assert.equal(payload.unitCost, 0)
  assert.equal(payload.currency, 'TZS')
  assert.equal(payload.taxCode, 'E')
  assert.equal(payload.taxRate, 0)
  assert.equal(payload.hazardousIndicator, true)
  assert.equal(payload.createdByName, 'Administrator')
  assert.equal(payload.inUse, true)
  assert.equal('IsOnline' in payload, false)
})


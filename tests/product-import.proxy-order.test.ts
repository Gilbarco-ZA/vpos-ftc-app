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

  assert.deepEqual(payload, {
    productId: '4',
    productCode: 'G4',
    productClassCode: 'FUEL',
    productTypeCode: 'FUEL',
    productName: 'Diesel 50',
    category: 'Fuel',
    unitPrice: 206.9,
    unitCost: 0,
    currency: 'TZS',
    taxCode: 'E',
    taxRate: 0,
    hazardousIndicator: true,
    createdByName: 'Administrator',
    inUse: true,
  })
  assert.equal('IsOnline' in payload, false)
})


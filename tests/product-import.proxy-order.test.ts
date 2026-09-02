import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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

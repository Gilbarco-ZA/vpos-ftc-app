import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const form = readFileSync('components/products/ProductsUpsertSheetContent.tsx', 'utf8')
const table = readFileSync('components/products/ProductsTable.tsx', 'utf8')
const client = readFileSync('app/(dashboard)/admin/products/client.tsx', 'utf8')
const route = readFileSync('app/api/products/[productId]/route.ts', 'utf8')
const sql = readFileSync('src/modules/products/infrastructure/persistence/product.sql.ts', 'utf8')

test('edited product name updates local productName as well as extDescription', () => {
  assert.match(form, /extDescription: event\.target\.value,\s*productName: event\.target\.value/)
})
test('administrator can toggle products active without hard deletion', () => {
  assert.match(table, /Mark inactive/)
  assert.match(table, /Reactivate/)
  assert.match(client, /method: 'PATCH'/)
  assert.match(route, /setProductActive/)
  assert.match(sql, /p\.is_active/)
  assert.doesNotMatch(route, /DELETE FROM products/)
})

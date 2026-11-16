import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('buyer type migration only backfills null Kenya customer classifications', () => {
  const migration = read(
    'scripts/migrations/postgres/1341_customers_buyer_type_b2c_default.sql',
  )

  assert.match(migration, /UPDATE customers AS c\s+SET buyer_type = 'B2C'/i)
  assert.match(migration, /WHERE c\.buyer_type IS NULL/i)
  assert.match(migration, /BTRIM\(COALESCE\(c\.country, ''\)\)\) = 'KE'/i)
  assert.match(migration, /NULLIF\(BTRIM\(c\.country\), ''\) IS NULL/i)
  assert.match(migration, /FROM fuel_stations AS fs/i)
  assert.match(migration, /fs\.id = c\.station_id/i)
  assert.match(migration, /BTRIM\(COALESCE\(fs\.country, ''\)\)\) = 'KE'/i)
  assert.doesNotMatch(migration, /ALTER TABLE customers/i)
  assert.doesNotMatch(migration, /ALTER COLUMN buyer_type SET DEFAULT/i)
})

test('customer repository limits B2C defaults to Kenya country', () => {
  const repository = read('src/modules/customers/infrastructure/customersRepo.ts')

  assert.match(repository, /buyerType: row\.buyer_type \?\? \(String\(row\.country/)
  assert.match(repository, /toUpperCase\(\) === 'KE' \? 'B2C' : null/)
  assert.match(repository, /buyer_type = COALESCE\(\$2, buyer_type\)/)
  assert.match(repository, /buyer_type = \$2,/)
  assert.match(repository, /const buyerType = data\.buyerType\?\.trim\(\) \|\|/)
  assert.equal(
    (repository.match(/toUpperCase\(\) === 'KE' \? 'B2C' : null/g) ?? []).length,
    2,
    'customer read mapping and upsert must both use Kenya-only defaults',
  )
  assert.equal(
    (repository.match(/^\s+buyerType,$/gm) ?? []).length,
    2,
    'customer upsert and insert should use the country-scoped buyer type',
  )
})

test('customer updates only backfill Kenya null types without overwriting explicit ones', () => {
  const service = read('src/modules/customers/application/updateCustomerRecord.ts')
  assert.match(service, /existingCountry === 'KE' && !normalizeOptional\(existing\.buyer_type\)/)
  assert.match(service, /buyerType: normalizeOptional\(data\.buyerType\)/)
})

test('form and preview B2C defaults are Kenya-only', () => {
  const drawer = read('components/customers/CustomerDrawer.tsx')
  const sheet = read('components/transactions/non-fiscalized/NonFiscalizedFiscalizeSheet.tsx')
  const preview = read(
    'src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts',
  )

  assert.match(drawer, /buyerType: isKenyaStation\(stationCountry\) \? 'B2C' : ''/)
  assert.match(drawer, /customer\.buyerType \|\|/)
  assert.match(sheet, /buyerType: isKenyaStation\(stationCountry\) \? 'B2C' : null/)
  assert.match(sheet, /isKenyaStation\(stationCountry\) \? 'B2C' : null/)
  assert.match(sheet, /setBuyerType\(isKenyaStation\(stationCountry\) \? 'B2C' : ''\)/)
  assert.match(
    sheet,
    /setBuyerType\(mapped\.buyerType \|\| \(isKenyaStation\(stationCountry\) \? 'B2C' : ''\)\)/,
  )
  assert.match(sheet, /!isKenyaStation\(stationCountry\) && \(/)
  assert.match(sheet, /<option value="">Unspecified<\/option>/)
  assert.match(sheet, /buyerType: buyerType\.trim\(\) \|\| undefined/)
  assert.doesNotMatch(sheet, /setBuyerType\(buyerTypeOptions\[0\]\?\.value/)
  assert.doesNotMatch(sheet, /setBuyerType\(mapped\.buyerType \|\| 'B2C'\)/)
  assert.match(preview, /buyerType: txn\.buyer_type \?\? null/)
})

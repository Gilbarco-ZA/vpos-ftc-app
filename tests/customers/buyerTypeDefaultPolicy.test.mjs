import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('customer buyer type backfill only changes null classifications', () => {
  const migration = read(
    'scripts/migrations/postgres/1341_customers_buyer_type_b2c_default.sql',
  )
  assert.match(migration, /UPDATE customers\s+SET buyer_type = 'B2C'/i)
  assert.match(migration, /WHERE buyer_type IS NULL/i)
  assert.match(migration, /ALTER COLUMN buyer_type SET DEFAULT 'B2C'/i)
  assert.doesNotMatch(migration, /SET\s+NOT\s+NULL/i)
})

test('customer persistence writes the B2C default even when buyerType is omitted', () => {
  const repository = read('src/modules/customers/infrastructure/customersRepo.ts')
  assert.match(repository, /buyerType: row\.buyer_type \?\? 'B2C'/)
  assert.match(repository, /buyer_type = COALESCE\(\$2, 'B2C'\)/)
  assert.match(repository, /buyer_type = COALESCE\(\$2, buyer_type, 'B2C'\)/)
  assert.equal(
    (repository.match(/data\.buyerType\?\.trim\(\) \|\| 'B2C'/g) ?? []).length,
    2,
    'both customer INSERT and upsert UPDATE should supply B2C',
  )
})

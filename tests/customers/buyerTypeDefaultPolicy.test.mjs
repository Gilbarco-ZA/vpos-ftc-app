import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('corrective migrations preserve non-Kenya null buyer classifications', () => {
  const snapshotName =
    '1340z_snapshot_non_kenya_null_buyer_types.sql'
  const originalName =
    '1341_customers_buyer_type_b2c_default.sql'
  const correctionName =
    '1342_kenya_only_buyer_type_b2c_default.sql'

  // Both fresh and previously upgraded installations use the unchanged 1341.
  // New installations must snapshot non-Kenya nulls before running it.
  assert.ok(snapshotName < originalName)
  assert.ok(originalName < correctionName)

  const snapshot = read(`scripts/migrations/postgres/${snapshotName}`)
  const correction = read(`scripts/migrations/postgres/${correctionName}`)

  assert.match(snapshot, /buyer_type IS NULL/i)
  assert.match(snapshot, /NOT IN \('KE', 'KEN', 'KENYA'\)/)
  assert.match(correction, /ALTER COLUMN buyer_type DROP DEFAULT/i)
  assert.match(correction, /FROM migration_1341_non_kenya_null_buyer_types/i)
  assert.match(correction, /SET buyer_type = NULL/i)
  assert.match(correction, /IN \('KE', 'KEN', 'KENYA'\)/)
  assert.match(correction, /WHERE buyer_type IS NULL/i)
})

test('customer persistence no longer applies B2C globally', () => {
  const repository = read('src/modules/customers/infrastructure/customersRepo.ts')
  const create = read('src/modules/customers/application/createCustomerRecord.ts')
  const update = read('src/modules/customers/application/updateCustomerRecord.ts')
  const drawer = read('components/customers/CustomerDrawer.tsx')

  assert.match(repository, /buyer_type = COALESCE\(\$2, buyer_type\)/)
  assert.match(repository, /buyer_type = \$2,/)
  assert.equal(
    (repository.match(/data\.buyerType \|\| null/g) ?? []).length,
    2,
    'both customer INSERT and upsert UPDATE allow non-Kenya nulls',
  )
  assert.match(create, /stationCountry === 'KE'[\s\S]*?data\.buyerType\?\.trim\(\) \|\| 'B2C'/)
  assert.match(update, /existingCountry === 'KE'[\s\S]*?normalizeOptional\(data\.buyerType\)/)
  assert.match(drawer, /isKenyaStation\(stationCountry\) \? 'B2C' : ''/)
})

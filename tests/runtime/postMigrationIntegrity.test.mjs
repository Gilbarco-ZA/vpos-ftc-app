import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('shared product exports survive print and retention merges', () => {
  const types = read('src/shared/types/index.ts')
  const mapper = read(
    'src/modules/products/infrastructure/persistence/product.mapper.ts',
  )

  assert.match(mapper, /import type \{ Product, ProductSyncStatus \}/)
  assert.match(types, /export type Product =/)
  assert.match(types, /export type SelectOption =/)
  assert.match(types, /PRINT_JOB_RETRIED/)
  assert.match(types, /STORAGE_RETENTION_POLICY_UPDATED/)
})

test('manual retention remains available when automatic retention is disabled', () => {
  const route = read('app/api/admin/config/retention/run/route.ts')
  const worker = read('src/platform/retention/stationStorageRetention.ts')

  assert.match(route, /runStationStorageRetention\(user\.stationId,[\s\S]*force: true/)
  assert.match(worker, /options: \{ force\?: boolean \}/)
  assert.match(worker, /!policy\.enabled && !options\.force/)
})

test('receipt and print-job migrations match current canonical writers', () => {
  const jobsMigration = read(
    'scripts/migrations/postgres/1256_reference_based_print_jobs.sql',
  )
  const receiptMigration = read(
    'scripts/migrations/postgres/1257_plain_text_receipt_canonical.sql',
  )
  const receiptWriter = read(
    'src/modules/transactions/infrastructure/persistence/transaction-read.repository.ts',
  )
  const fiscalWriter = read(
    'src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts',
  )

  assert.match(jobsMigration, /job_type = 'print\.receipt'/)
  assert.match(jobsMigration, /source_transaction_id IS NOT NULL/)
  assert.match(jobsMigration, /status <> 'PROCESSING'/)
  assert.match(receiptMigration, /ALTER COLUMN html_content DROP NOT NULL/)
  assert.match(receiptMigration, /ADD COLUMN IF NOT EXISTS render_version/)
  assert.match(receiptWriter, /VALUES \(\$1,\$2,\$3,\$4,NULL,\$5,\$6,\$7,\$8\)/)
  assert.match(fiscalWriter, /'print\.receipt'/)
  assert.match(fiscalWriter, /source_transaction_id/)
})

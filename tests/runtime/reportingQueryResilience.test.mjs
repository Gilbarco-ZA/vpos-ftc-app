import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const repository = readFileSync(
  'src/modules/transactions/infrastructure/persistence/transaction-list-with-receipts.repository.ts',
  'utf8',
)
const migration = readFileSync(
  'scripts/migrations/postgres/1340_reporting_read_path_indexes.sql',
  'utf8',
)

test('reporting reads prefer the transaction latest fiscal event pointer', () => {
  assert.match(repository, /LEFT JOIN fiscalization_events latest_fe/)
  assert.match(repository, /latest_fe\.id = t\.latest_fiscal_event_id/)
  assert.match(repository, /FROM fiscalization_events fe/)
})

test('reporting pagination counts skip receipt joins unless search needs them', () => {
  assert.match(
    repository,
    /const countFromSql = hasSearch \? fromSql : 'FROM transactions t'/,
  )
})

test('non-search report previews limit transactions before receipt enrichment', () => {
  assert.match(repository, /FROM \(\s*SELECT t\.\*[\s\S]*LIMIT \$\{limitParam\}[\s\S]*\) t/)
  assert.match(repository, /if \(!hasSearch\)/)
})

test('reporting migration covers station date scans and latest receipt lookup', () => {
  assert.match(
    migration,
    /ON transactions \(station_id, transaction_date_time DESC\)/,
  )
  assert.match(
    migration,
    /ON receipts \(station_id, transaction_id, generated_at DESC\)/,
  )
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const preview = readFileSync('app/api/admin/system/purge/preview/route.ts', 'utf8')
const execute = readFileSync('app/api/admin/system/purge/execute/route.ts', 'utf8')
const maintenance = readFileSync('app/(dashboard)/admin/maintenance/MaintenanceClient.tsx', 'utf8')
const panel = readFileSync('components/admin/SystemDataManagementPanel.tsx', 'utf8')

test('retention assessment is administrator-only, station scoped and read-only', () => {
  assert.match(preview, /roles: \['administrator'\]/)
  assert.match(preview, /kind === 'transactions'/)
  assert.match(preview, /nativeConfirmed:/)
  assert.match(preview, /legacyOrUnverified:/)
  assert.match(preview, /kind, startDate, endDate/)
  assert.match(preview, /transactionsTotal/)
  assert.match(preview, /reportsTotal/)
  assert.match(preview, /stationTimezoneSql/)
  assert.match(preview, /SELECT COUNT\(\*\)::text/)
  assert.match(preview, /station_id = \$1/)
  assert.doesNotMatch(preview, /defineMutationRoute|DELETE FROM|TRUNCATE|DROP TABLE/)
})

test('maintenance page chooses transactions or reports and previews date-range counts', () => {
  assert.match(maintenance, /<option value="transactions">Transactions<\/option>/)
  assert.match(maintenance, /<option value="reports">Reports<\/option>/)
  assert.match(maintenance, /type="date"/)
  assert.match(maintenance, /\/api\/admin\/system\/purge\/preview/)
  assert.match(maintenance, /purgePreview\.total/)
  assert.match(maintenance, /purgePreview\.transactionsTotal/)
  assert.match(maintenance, /purgePreview\.reportsTotal/)
  assert.match(maintenance, /purgePreview\.nativeConfirmed/)
  assert.match(maintenance, /PURGE TRANSACTIONS/)
  assert.match(panel, /href="\/admin\/maintenance"/)
})

test('purge execution is fail-closed for reports and legacy imports', () => {
  assert.match(execute, /roles: \['administrator'\]/)
  assert.match(execute, /kind !== 'transactions'/)
  assert.match(execute, /t\.legacy_filename IS NULL/)
  assert.match(execute, /fe\.status = 'SUCCESS' AND fe\.origin = 'runtime'/)
  assert.match(execute, /fe\.origin IN \('legacy_import', 'backfill'\)/)
  assert.match(execute, /endDate >= new Date\(\)/)
  assert.match(execute, /stationTimezoneSql/)
  assert.match(execute, /confirmation !==/)
})

test('purge creates a recovery backup, locks and checks dependencies, and deletes in small batches', () => {
  assert.match(execute, /await createDatabaseBackup\(\)/)
  assert.match(execute, /pg_try_advisory_xact_lock/)
  assert.match(execute, /pg_constraint/)
  assert.match(execute, /LIMIT 50/)
  assert.match(execute, /FOR UPDATE OF t SKIP LOCKED/)
  assert.match(execute, /DELETE FROM receipts/)
  assert.match(execute, /DELETE FROM transactions/)
  assert.match(execute, /transaction_queue/)
  assert.match(execute, /print_jobs/)
  assert.match(execute, /tanzania_proxy_invoice_assignments/)
  assert.match(execute, /credit_notes/)
  assert.match(execute, /ewura_transactions/)
  assert.match(execute, /INSERT INTO audit_logs/)
})

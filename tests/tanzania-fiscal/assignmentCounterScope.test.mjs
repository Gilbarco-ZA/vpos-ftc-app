import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('Tanzania assignment uniqueness does not couple fiscal Z-number to transaction-date daily counter', () => {
  const migration = read(
    'scripts/migrations/postgres/1320_tanzania_assignment_counter_scope.sql',
  )
  const proxyInvoice = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyInvoice.ts',
  )
  const preFiscalAssignment = read(
    'src/modules/tanzania-fiscal/infrastructure/preFiscalizationReceiptAssignment.ts',
  )

  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS\s+tanzania_proxy_invoice_assign_station_id_z_number_daily_cou_key/,
  )

  for (const source of [proxyInvoice, preFiscalAssignment]) {
    assert.match(source, /`receipt:\$\{transactionDate\.compactDate\}`/)
    assert.match(source, /fiscalDate\.compactDate,\s*dailyCounter/)
  }
})

test('Tanzania assignments retain independent transaction, invoice, and global-counter uniqueness', () => {
  const originalMigration = read(
    'scripts/migrations/postgres/1270_tanzania_proxy_contract.sql',
  )
  const scopeMigration = read(
    'scripts/migrations/postgres/1320_tanzania_assignment_counter_scope.sql',
  )

  assert.match(originalMigration, /PRIMARY KEY \(station_id, transaction_id\)/)
  assert.match(originalMigration, /UNIQUE \(station_id, invoice_number\)/)
  assert.match(originalMigration, /UNIQUE \(station_id, global_counter\)/)

  const droppedConstraints = Array.from(
    scopeMigration.matchAll(/DROP CONSTRAINT IF EXISTS\s+([A-Za-z0-9_]+)/g),
    (match) => match[1],
  )

  assert.deepEqual(droppedConstraints, [
    'tanzania_proxy_invoice_assign_station_id_z_number_daily_cou_key',
  ])
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tanzania transaction tank projection is captured and applied before fiscal identity allocation', () => {
  const projection = read(
    'src/modules/tanzania-fiscal/infrastructure/transactionTankProjection.ts',
  )
  const invoice = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyInvoice.ts',
  )
  const pumpCapture = read(
    'src/modules/pumps/infrastructure/transactionHandler.ts',
  )
  const jplCapture = read(
    'src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts',
  )
  const migration = read(
    'scripts/migrations/postgres/1280_tanzania_transaction_tank_projection.sql',
  )
  const evidenceMigration = read(
    'scripts/migrations/postgres/1282_atg_transaction_projection_evidence.sql',
  )

  assert.match(projection, /scope_type.*GROUP.*ACTIVE_TANK/s)
  assert.match(projection, /baseline - prior - transaction/i)
  assert.match(projection, /tankVolume: projection\.reportedVolumeLitres/)
  assert.match(projection, /tankId: projection\.representativeDomsTankId/)
  assert.match(projection, /source_tank\.tank_group_id = \$7::uuid/)
  assert.match(projection, /source_tank\.tank_group_id IS NULL/)
  assert.match(projection, /FROM tank_atg_capture_evidence/)
  assert.match(projection, /captured_at <= \$3::timestamptz/)
  assert.match(projection, /loadReusableProjectionBaseline/)
  assert.match(projection, /projection\.member_tank_ids @>/)
  assert.match(projection, /projection\.member_tank_ids <@/)
  assert.doesNotMatch(projection, /total_amount/)

  assert.ok(
    invoice.indexOf('ensureTanzaniaTransactionTankProjection') <
      invoice.indexOf('allocateAssignment({'),
  )
  assert.match(pumpCapture, /ensureTanzaniaTransactionTankProjection/)
  assert.match(jplCapture, /ensureTanzaniaTransactionTankProjection/)
  assert.match(migration, /tanzania_transaction_tank_projections/)
  assert.match(migration, /atg_captured_at/)
  assert.match(migration, /representative_doms_tank_id/)
  assert.match(migration, /reported_volume_litres/)
  assert.match(evidenceMigration, /tank_atg_capture_evidence/)
  assert.match(evidenceMigration, /PRIMARY KEY \(tank_id, captured_at\)/)
  assert.match(evidenceMigration, /FROM tank_atg_snapshots/)
})

test('Tanzania daily totals enumerate physical tanks without grouping them', () => {
  const daily = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyDailyTotals.ts',
  )
  assert.match(daily, /FROM tanks t/)
  assert.match(daily, /LEFT JOIN tank_atg_snapshots atg/)
  assert.match(daily, /AND t\.status = 'ACTIVE'/)
  assert.match(daily, /tanks: args\.tanks\?\.length \? args\.tanks : undefined/)
  assert.doesNotMatch(daily, /GROUP BY t\.tank_group_id/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('PSS import treats physical dispenser address as part of pump identity', () => {
  const parser = read('src/shared/integrations/pssXml/xml.ts')
  const importer = read('src/modules/setup/infrastructure/pssXmlImporter.ts')
  const sync = read('src/shared/setup/forecourtSync.ts')
  const migration = read(
    'scripts/migrations/postgres/1281_pss_physical_topology_identity.sql',
  )

  assert.match(parser, /getDirectChild\(fp, 'PhysicalAddress'\)/)
  assert.match(importer, /physicalAddress: fp\.physicalAddress \?\? null/)
  assert.match(
    sync,
    /doms_pss_port_no = \$2[\s\S]*doms_physical_address = \$3[\s\S]*doms_device_sub_address = \$4/,
  )
  assert.match(migration, /DROP INDEX IF EXISTS ux_pumps_station_doms_port_subaddr/)
  assert.match(
    migration,
    /ON pumps\(station_id, doms_pss_port_no, doms_physical_address, doms_device_sub_address\)/,
  )
  assert.doesNotMatch(
    sync,
    /WHERE station_id = \$1\s+AND doms_device_sub_address = \$2\s+LIMIT 1/,
  )
})

test('PSS import keeps GradeOption, NozzleId, and all Part tank links distinct', () => {
  const parser = read('src/shared/integrations/pssXml/xml.ts')
  const importer = read('src/modules/setup/infrastructure/pssXmlImporter.ts')
  const exporter = read('src/platform/integrations/pssXml/exporter.ts')

  assert.match(parser, /getDirectChild\(go, 'NozzleId'\)/)
  assert.match(parser, /getDirectChildren\(go, 'Part'\)/)
  assert.match(importer, /const nozzleId = safeTrim\(go\.nozzleId\) \|\| gradeOptionId/)
  assert.match(importer, /domsGradeOptionId: gradeOptionId/)
  assert.match(importer, /domsTankIds: pssTankIds/)
  assert.match(exporter, /gradeOptionId/)
  assert.match(exporter, /nozzleId/)
  assert.match(exporter, /tankIds/)
})

test('PSS re-import is authoritative without deleting historical topology rows', () => {
  const importer = read('src/modules/setup/infrastructure/pssXmlImporter.ts')
  const sync = read('src/shared/setup/forecourtSync.ts')
  const backgroundSync = read(
    'src/modules/forecourt/infrastructure/configSync/service.ts',
  )
  const route = read(
    'src/modules/admin-integrations/application/runAdminPssXmlAction.ts',
  )
  const transactionWriter = read(
    'src/modules/transactions/infrastructure/persistence/transaction-write.repository.ts',
  )
  const migration = read(
    'scripts/migrations/postgres/1281_pss_physical_topology_identity.sql',
  )

  assert.match(importer, /authoritativeDomsSnapshot: true/)
  assert.match(sync, /SET is_active = FALSE/)
  assert.match(sync, /SET status = 'INACTIVE'/)
  assert.match(backgroundSync, /SET is_active = FALSE/)
  assert.match(backgroundSync, /SET status = 'INACTIVE'/)
  assert.doesNotMatch(backgroundSync, /DELETE FROM nozzles/)
  assert.doesNotMatch(backgroundSync, /DELETE FROM pumps/)
  assert.match(migration, /ux_nozzles_pump_active_number/)
  assert.match(migration, /WHERE is_active = TRUE/)
  assert.match(route, /status: 422/)
  assert.match(route, /status: 409/)
  assert.match(transactionWriter, /n\.is_active = TRUE/)
  assert.match(transactionWriter, /p\.status <> 'INACTIVE'/)
})

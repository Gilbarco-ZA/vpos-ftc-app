import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ConfigStorageAuditResult } from '@/src/platform/config/audit/configStorageAudit'
import {
  CONFIG_STORAGE_RESTORE_ACK,
  CONFIG_STORAGE_RETIREMENT_ACK,
  buildConfigStorageRetirementPlan,
} from '@/src/platform/config/retirement/configStorageRetirement'

const safeAudit = (): ConfigStorageAuditResult => ({
  migrationApplied: true,
  guardrailMigrationApplied: true,
  retirementSupportMigrationApplied: true,
  stationKv: {
    exists: true,
    totalRows: 3,
    oversizedRows: 0,
    unregisteredKeyRows: 0,
    valueJsonExists: true,
    valueJsonMeaningfulRows: 0,
    valueJsonDependencies: [],
    valueJsonSafeToDrop: true,
  },
  stationSettings: {
    exists: true,
    totalRows: 1,
    keyExists: true,
    keyPopulatedRows: 0,
    valueJsonExists: true,
    valueJsonMeaningfulRows: 0,
    keyNullable: true,
    keyDependencies: [],
    valueJsonDependencies: [],
    keySafeToDrop: true,
    valueJsonSafeToDrop: true,
  },
  jobQueue: {
    exists: true,
    totalRows: 0,
    byStatus: {},
    dependencies: [],
    safeToDrop: true,
  },
  retirementComplete: false,
  readyToApply: true,
  safeForDestructiveMigration: true,
})

test('retirement plan is ready only when every candidate is empty and dependency-free', () => {
  const plan = buildConfigStorageRetirementPlan(safeAudit())
  assert.equal(plan.readyToApply, true)
  assert.deepEqual(plan.blockers, [])
  assert.equal(plan.candidates.length, 4)
})

test('populated station settings keys block destructive retirement', () => {
  const audit = safeAudit()
  audit.stationSettings.keyPopulatedRows = 1
  audit.stationSettings.keySafeToDrop = false
  audit.readyToApply = false
  audit.safeForDestructiveMigration = false

  const plan = buildConfigStorageRetirementPlan(audit)
  assert.equal(plan.readyToApply, false)
  assert.match(plan.blockers.join(' '), /station_settings\.key is populated/)
})


test('missing canonical configuration tables block retirement', () => {
  const audit = safeAudit()
  audit.stationKv.exists = false
  audit.readyToApply = false
  audit.safeForDestructiveMigration = false

  const plan = buildConfigStorageRetirementPlan(audit)
  assert.equal(plan.readyToApply, false)
  assert.match(plan.blockers.join(' '), /Canonical station_kv table is missing/)
})

test('already retired storage produces a completed non-applicable plan', () => {
  const audit = safeAudit()
  audit.stationKv.valueJsonExists = false
  audit.stationSettings.keyExists = false
  audit.stationSettings.valueJsonExists = false
  audit.jobQueue.exists = false
  audit.retirementComplete = true
  audit.readyToApply = false

  const plan = buildConfigStorageRetirementPlan(audit)
  assert.equal(plan.retirementComplete, true)
  assert.equal(plan.readyToApply, false)
})

test('retirement acknowledgements are explicit and distinct', () => {
  assert.equal(CONFIG_STORAGE_RETIREMENT_ACK, 'DROP_LEGACY_CONFIG_STORAGE')
  assert.equal(
    CONFIG_STORAGE_RESTORE_ACK,
    'RESTORE_LEGACY_CONFIG_STORAGE_COMPATIBILITY',
  )
})

test('Phase 5D migration adds only the operator audit trail', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1266_legacy_config_storage_retirement_support.sql',
    'utf8',
  )

  assert.match(migration, /config_storage_retirement_runs/)
  assert.match(migration, /backup_reference/)
  assert.doesNotMatch(migration, /DROP TABLE\s+job_queue/i)
  assert.doesNotMatch(migration, /DROP COLUMN\s+(?:IF EXISTS\s+)?value_json/i)
})

test('destructive SQL is isolated behind the explicit retirement command', () => {
  const retirement = readFileSync(
    'src/platform/config/retirement/configStorageRetirement.ts',
    'utf8',
  )
  const cli = readFileSync('scripts/retire-config-storage.ts', 'utf8')

  assert.match(retirement, /maintenanceConfirmed/)
  assert.match(retirement, /backupReference/)
  assert.match(retirement, /pg_advisory_xact_lock/)
  assert.match(retirement, /DROP TABLE IF EXISTS job_queue RESTRICT/)
  assert.match(retirement, /DROP COLUMN IF EXISTS value_json/)
  assert.match(retirement, /Post-retirement audit/)
  assert.match(cli, /--maintenance-confirmed/)
  assert.match(cli, /--backup-reference/)
  assert.match(cli, /--restore-compatibility/)
})

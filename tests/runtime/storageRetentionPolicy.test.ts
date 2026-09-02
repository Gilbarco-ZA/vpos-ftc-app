import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import { buildStorageRetentionTargets } from '@/src/platform/retention/storageRetentionTargets'

test('storage retention is disabled and dry-run by default', () => {
  const policy = getStorageRetentionPolicy({})

  assert.equal(policy.enabled, false)
  assert.equal(policy.dryRun, true)
  assert.equal(policy.batchSize, 500)
  assert.equal(policy.maxBatches, 10)
  assert.equal(policy.printDoneDays, 7)
  assert.equal(policy.transactionQueueFailedDays, 90)
  assert.equal(policy.fiscalInboxResolvedDeadDays, 90)
  assert.equal(policy.forecourtRoutineEventDays, 7)
  assert.equal(policy.forecourtErrorEventDays, 30)
  assert.equal(policy.forecourtMaintenanceSecurityEventDays, 90)
  assert.equal(policy.forecourtFieldEvidenceEventDays, 180)
  assert.equal(policy.jplSupervisedReplayClearedDays, 14)
  assert.equal(policy.jplCheckpointClearedDays, 30)
  assert.equal(policy.configVersionLimit, 20)
  assert.equal(policy.configVersionMinAgeDays, 7)
  assert.equal(policy.pssParsedCompatibilityDays, 30)
  assert.equal(policy.forecourtPayloadCompactionEnabled, false)
  assert.equal(policy.forecourtPayloadDryRun, true)
  assert.equal(policy.forecourtPayloadGraceDays, 7)
})

test('storage retention settings are clamped to safe operational bounds', () => {
  const policy = getStorageRetentionPolicy({
    VPOS_RETENTION_ENABLED: 'yes',
    VPOS_RETENTION_DRY_RUN: 'off',
    VPOS_RETENTION_CLEANUP_INTERVAL_MS: '100',
    VPOS_RETENTION_BATCH_SIZE: '999999',
    VPOS_RETENTION_MAX_BATCHES: '0',
    VPOS_RETENTION_PRINT_DONE_DAYS: '-5',
    VPOS_RETENTION_TRANSACTION_QUEUE_FAILED_DAYS: '99999',
    VPOS_RETENTION_FORECOURT_ROUTINE_DAYS: '-1',
    VPOS_RETENTION_FORECOURT_FIELD_EVIDENCE_DAYS: '99999',
    VPOS_RETENTION_JPL_REPLAY_CLEARED_DAYS: '-1',
    VPOS_RETENTION_JPL_CHECKPOINT_CLEARED_DAYS: '99999',
    VPOS_RETENTION_CONFIG_VERSION_LIMIT: '0',
    VPOS_RETENTION_CONFIG_VERSION_MIN_AGE_DAYS: '99999',
    VPOS_RETENTION_PSS_PARSED_COMPATIBILITY_DAYS: '-1',
    VPOS_FORECOURT_PAYLOAD_COMPACTION_ENABLED: 'on',
    VPOS_FORECOURT_PAYLOAD_COMPACTION_DRY_RUN: 'false',
    VPOS_FORECOURT_PAYLOAD_GRACE_DAYS: '99999',
  })

  assert.equal(policy.enabled, true)
  assert.equal(policy.dryRun, false)
  assert.equal(policy.cleanupIntervalMs, 60_000)
  assert.equal(policy.batchSize, 5000)
  assert.equal(policy.maxBatches, 1)
  assert.equal(policy.printDoneDays, 0)
  assert.equal(policy.transactionQueueFailedDays, 3650)
  assert.equal(policy.forecourtRoutineEventDays, 0)
  assert.equal(policy.forecourtFieldEvidenceEventDays, 3650)
  assert.equal(policy.jplSupervisedReplayClearedDays, 0)
  assert.equal(policy.jplCheckpointClearedDays, 3650)
  assert.equal(policy.configVersionLimit, 1)
  assert.equal(policy.configVersionMinAgeDays, 3650)
  assert.equal(policy.pssParsedCompatibilityDays, 0)
  assert.equal(policy.forecourtPayloadCompactionEnabled, true)
  assert.equal(policy.forecourtPayloadDryRun, false)
  assert.equal(policy.forecourtPayloadGraceDays, 3650)
})

test('retention targets are station-scoped and exclude active work', () => {
  const targets = buildStorageRetentionTargets(getStorageRetentionPolicy({}))

  assert.ok(targets.length >= 10)
  for (const target of targets) {
    assert.match(target.stationPredicateSql, /station_id/)
    assert.doesNotMatch(target.eligibilitySql, /status\s*=\s*'PENDING'/)
    assert.doesNotMatch(target.eligibilitySql, /status\s*=\s*'PROCESSING'/)
  }

  const uuidScopedTargets = targets.filter(
    (target) =>
      target.key !== 'fiscal_inbox_processed' &&
      target.key !== 'fiscal_inbox_resolved_dead',
  )
  for (const target of uuidScopedTargets) {
    assert.match(target.stationPredicateSql, /station_id = \$1::uuid/)
    assert.doesNotMatch(target.stationPredicateSql, /station_id::text/)
  }

  const fiscalTargets = targets.filter((target) =>
    target.key.startsWith('fiscal_inbox_'),
  )
  for (const target of fiscalTargets) {
    assert.match(target.stationPredicateSql, /station_id = \$1::text/)
  }

  const transactionFailure = targets.find(
    (target) => target.key === 'transaction_queue_failed',
  )
  assert.match(
    transactionFailure?.eligibilitySql ?? '',
    /next_attempt_at IS NULL/,
  )

  const reportFailure = targets.find(
    (target) => target.key === 'report_queue_failed',
  )
  assert.match(reportFailure?.eligibilitySql ?? '', /next_attempt_at IS NULL/)

  const deadInbox = targets.find(
    (target) => target.key === 'fiscal_inbox_resolved_dead',
  )
  assert.match(deadInbox?.eligibilitySql ?? '', /resolved_at IS NOT NULL/)

  const eventTargets = targets.filter((target) =>
    target.key.startsWith('forecourt_events_'),
  )
  assert.equal(eventTargets.length, 4)
  for (const target of eventTargets) {
    assert.equal(target.table, 'forecourt_events')
    assert.match(target.eligibilitySql, /retention_class/)
  }
})

test('successful queue cleanup requires durable canonical records', () => {
  const targets = buildStorageRetentionTargets(getStorageRetentionPolicy({}))

  const printDone = targets.find((target) => target.key === 'print_jobs_done')
  assert.match(printDone?.eligibilitySql ?? '', /FROM receipts/)
  assert.match(printDone?.eligibilitySql ?? '', /FROM reports/)

  const transactionDone = targets.find(
    (target) => target.key === 'transaction_queue_done',
  )
  assert.match(transactionDone?.eligibilitySql ?? '', /FROM transactions/)
  assert.match(transactionDone?.eligibilitySql ?? '', /source_queue_id/)

  const reportDone = targets.find(
    (target) => target.key === 'report_queue_done',
  )
  assert.match(reportDone?.eligibilitySql ?? '', /FROM reports/)
  assert.match(reportDone?.eligibilitySql ?? '', /source_queue_id/)
})

test('retention implementation uses bounded deletes, dry-run and advisory locking', () => {
  const source = readFileSync(
    'src/platform/retention/storageRetention.ts',
    'utf8',
  )

  assert.match(source, /VPOS_RETENTION_DRY_RUN|policy\.dryRun/)
  assert.match(source, /pg_try_advisory_xact_lock/)
  assert.match(source, /LIMIT \$3/)
  assert.match(source, /FOR UPDATE OF \${target\.alias} SKIP LOCKED/)
  assert.match(source, /lock_timeout/)
  assert.match(source, /statement_timeout/)
  assert.match(source, /clearInterval\(retentionTimer\)/)
  assert.match(source, /return retentionStopHandle/)
  assert.doesNotMatch(source, /DELETE FROM [a-z_]+\s*$/m)
})

test('fiscal inbox resolution timestamps protect unresolved dead letters', () => {
  const sql = readFileSync(
    'src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.sql.ts',
    'utf8',
  )
  const repository = readFileSync(
    'src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository.ts',
    'utf8',
  )

  assert.match(sql, /markDeadById:[\s\S]*resolved_at = NULL/)
  assert.match(sql, /markProcessedById:[\s\S]*resolved_at = COALESCE/)
  assert.match(sql, /requeueById:[\s\S]*resolved_at = NULL/)
  assert.match(repository, /status = 'DEAD'[\s\S]*resolved_at = COALESCE/)
})

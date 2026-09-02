import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import { buildStorageRetentionTargets } from '@/src/platform/retention/storageRetentionTargets'

test('JPL terminal retention defaults are bounded and independently configurable', () => {
  const defaults = getStorageRetentionPolicy({})
  assert.equal(defaults.jplSupervisedReplayClearedDays, 14)
  assert.equal(defaults.jplCheckpointClearedDays, 30)

  const clamped = getStorageRetentionPolicy({
    VPOS_RETENTION_JPL_REPLAY_CLEARED_DAYS: '-5',
    VPOS_RETENTION_JPL_CHECKPOINT_CLEARED_DAYS: '99999',
  })
  assert.equal(clamped.jplSupervisedReplayClearedDays, 0)
  assert.equal(clamped.jplCheckpointClearedDays, 3650)
})

test('terminal JPL rows are deleted only after payload clearing and canonical transaction completion', () => {
  const targets = buildStorageRetentionTargets(getStorageRetentionPolicy({}))
  const replay = targets.find(
    (target) => target.key === 'jpl_supervised_replay_cleared',
  )
  const checkpoint = targets.find(
    (target) => target.key === 'jpl_transaction_checkpoints_cleared',
  )

  assert.ok(replay)
  assert.ok(checkpoint)

  for (const target of [replay, checkpoint]) {
    assert.match(target?.eligibilitySql ?? '', /terminal_at IS NOT NULL/)
    assert.match(target?.eligibilitySql ?? '', /terminal_outcome = 'cleared'/)
    assert.match(target?.eligibilitySql ?? '', /payload_cleared_at IS NOT NULL/)
    assert.match(target?.eligibilitySql ?? '', /last_error IS NULL/)
    assert.match(target?.eligibilitySql ?? '', /doms_cleared_at IS NOT NULL/)
    assert.match(
      target?.eligibilitySql ?? '',
      /doms_payload_cleared_at IS NOT NULL/,
    )
    assert.match(target?.deleteMatchSql ?? '', /candidate_station_id/)
  }

  assert.match(checkpoint?.eligibilitySql ?? '', /blocked_by_foreign_pos = FALSE/)
  assert.match(checkpoint?.deleteMatchSql ?? '', /candidate_source_mode/)
  assert.match(replay?.deleteMatchSql ?? '', /candidate_fp_id/)
})

test('supervised replay storage reads payloads from the canonical checkpoint owner', () => {
  const repository = readFileSync(
    'src/modules/forecourt/infrastructure/repositories/forecourtJplReplayRepo.ts',
    'utf8',
  )
  const replay = readFileSync(
    'src/modules/forecourt/infrastructure/jpl/replay.ts',
    'utf8',
  )

  assert.match(
    repository,
    /COALESCE\(checkpoint\.read_payload_json, replay\.read_payload_json\)/,
  )
  assert.match(
    repository,
    /COALESCE\(checkpoint\.clear_payload_json, replay\.clear_fields_json\)/,
  )
  assert.match(repository, /payload_owner = 'checkpoint'/)
  assert.doesNotMatch(repository, /args\.readPayloadJson/)
  assert.doesNotMatch(repository, /args\.clearFieldsJson/)

  const replayUpsertBlocks = replay.match(/forecourtJplReplayRepo\.upsert\(\{[\s\S]*?\n\s*\}\)/g) ?? []
  assert.ok(replayUpsertBlocks.length >= 3)
  for (const block of replayUpsertBlocks) {
    assert.doesNotMatch(block, /readPayloadJson/)
    assert.doesNotMatch(block, /clearFieldsJson/)
  }
  assert.match(
    replay,
    /forecourtJplTransactionCheckpointRepo\.upsert\([\s\S]*?readPayloadJson:[\s\S]*?forecourtJplReplayRepo\.upsert/,
  )
  assert.match(replay, /replayStage: 'cleared'/)
})

test('legacy replay payloads are copied before duplicate storage is compacted', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1262_jpl_checkpoint_replay_retention.sql',
    'utf8',
  )
  const compaction = readFileSync(
    'src/platform/retention/forecourtPayloadRetention.ts',
    'utf8',
  )

  assert.match(
    migration,
    /INSERT INTO forecourt_jpl_transaction_checkpoints[\s\S]*FROM forecourt_jpl_supervised_replay/,
  )
  assert.match(migration, /payload_owner VARCHAR\(24\)/)
  assert.match(migration, /terminal_at TIMESTAMPTZ/)
  assert.match(migration, /idx_jpl_checkpoint_terminal_retention/)
  assert.match(migration, /idx_jpl_replay_terminal_retention/)
  assert.doesNotMatch(migration, /DELETE FROM/)

  assert.match(compaction, /jpl_supervised_replay_duplicate_payloads/)
  assert.match(compaction, /payload_consolidated_to_checkpoint/)
  assert.match(compaction, /checkpoint\.read_payload_json IS NOT NULL/)
  assert.match(compaction, /checkpoint\.clear_payload_json IS NOT NULL/)
  assert.match(compaction, /read_payload_json = NULL/)
  assert.match(compaction, /clear_fields_json = NULL/)
})

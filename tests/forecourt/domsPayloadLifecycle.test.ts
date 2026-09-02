import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  resolveForecourtPayloadClearability,
  resolveForecourtPayloadState,
} from '@/src/modules/forecourt/domain/payloadLifecycle'

const eligibleInput = {
  hasPayload: true,
  normalizedAt: '2026-07-01T10:00:00.000Z',
  reconciledAt: '2026-07-01T10:01:00.000Z',
  controllerClearedAt: '2026-07-01T10:02:00.000Z',
  lineCount: 1,
  hasActiveRecoveryClaim: false,
  eligibleAfter: '2026-07-08T10:02:00.000Z',
  now: '2026-07-09T10:02:00.000Z',
} as const

test('forecourt payload clearing requires complete durable lifecycle evidence', () => {
  assert.deepEqual(resolveForecourtPayloadClearability(eligibleInput), {
    eligible: true,
    reason: 'eligible',
  })

  assert.equal(
    resolveForecourtPayloadClearability({ ...eligibleInput, lineCount: 0 })
      .reason,
    'transaction-lines-missing',
  )
  assert.equal(
    resolveForecourtPayloadClearability({
      ...eligibleInput,
      hasActiveRecoveryClaim: true,
    }).reason,
    'active-recovery-claim',
  )
  assert.equal(
    resolveForecourtPayloadClearability({
      ...eligibleInput,
      controllerClearedAt: null,
    }).reason,
    'controller-not-cleared',
  )
  assert.equal(
    resolveForecourtPayloadClearability({
      ...eligibleInput,
      now: '2026-07-07T10:02:00.000Z',
    }).reason,
    'recovery-window-open',
  )
})

test('payload lifecycle distinguishes policy clearing from missing capture', () => {
  assert.equal(
    resolveForecourtPayloadState({ hasPayload: false }),
    'never-captured',
  )
  assert.equal(
    resolveForecourtPayloadState({
      hasPayload: false,
      payloadClearedAt: '2026-07-10T00:00:00.000Z',
    }),
    'cleared-by-policy',
  )
  assert.equal(
    resolveForecourtPayloadState({
      hasPayload: true,
      normalizedAt: '2026-07-01T00:00:00.000Z',
    }),
    'normalized',
  )
})

test('forecourt payload compaction is bounded, dry-run safe, and recovery aware', () => {
  const source = readFileSync(
    'src/platform/retention/forecourtPayloadRetention.ts',
    'utf8',
  )

  assert.match(source, /EXISTS \([\s\S]*FROM transaction_lines/)
  assert.match(source, /lifecycle_stage = 'cleared'/)
  assert.match(source, /blocked_by_foreign_pos = FALSE/)
  assert.match(source, /last_error IS NULL/)
  assert.match(source, /doms_cleared_at IS NOT NULL/)
  assert.match(source, /FOR UPDATE OF \$\{target\.lockAlias\} SKIP LOCKED/)
  assert.match(source, /LIMIT \$3/)
  assert.match(source, /LIMIT \$2/)
  assert.match(source, /policy\.forecourtPayloadDryRun/)
  assert.match(
    source,
    /if \(!policy\.forecourtPayloadDryRun\)[\s\S]*parameters\.push/,
  )
  assert.doesNotMatch(source, /DELETE FROM/)
  assert.match(source, /doms_payload_json = NULL/)
  assert.match(source, /raw = '\{\}'::jsonb/)
  assert.match(source, /read_payload_json = NULL/)
  assert.match(source, /clear_payload_json = NULL/)
})

test('migration adds lifecycle markers and indexed compaction candidates', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1260_forecourt_payload_lifecycle.sql',
    'utf8',
  )

  assert.match(migration, /doms_normalized_at TIMESTAMPTZ/)
  assert.match(migration, /doms_payload_cleared_at TIMESTAMPTZ/)
  assert.match(migration, /normalized_transaction_id UUID REFERENCES transactions/)
  assert.match(migration, /raw_cleared_at TIMESTAMPTZ/)
  assert.match(migration, /payload_cleared_at TIMESTAMPTZ/)
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_transactions_doms_payload_compaction/)
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_forecourt_transactions_raw_compaction/)
  assert.doesNotMatch(migration, /DELETE FROM/)
})

test('recaptured payloads reset prior compaction markers', () => {
  const ingestion = readFileSync(
    'src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts',
    'utf8',
  )
  const repository = readFileSync(
    'src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionsRepo.ts',
    'utf8',
  )
  const checkpoint = readFileSync(
    'src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionCheckpointRepo.ts',
    'utf8',
  )

  for (const source of [ingestion, repository]) {
    assert.match(source, /doms_payload_cleared_at = NULL/)
    assert.match(source, /doms_payload_clear_reason = NULL/)
  }
  assert.match(checkpoint, /payload_cleared_at = CASE[\s\S]*THEN NULL/)
  assert.match(checkpoint, /payload_clear_reason = CASE[\s\S]*THEN NULL/)
})

test('support diagnostics expose lifecycle state and duplicate SQL modules are removed', () => {
  const support = readFileSync(
    'src/modules/forecourt/application/domsSupportBundle.ts',
    'utf8',
  )
  const admin = readFileSync(
    'src/modules/forecourt/infrastructure/adminRepo.ts',
    'utf8',
  )

  assert.match(support, /payloadLifecycle/)
  assert.match(admin, /transaction_payload_cleared/)
  assert.match(admin, /raw_payload_cleared/)
  assert.match(admin, /raw_payload_unlinked/)
  assert.equal(
    existsSync('src/platform/db/queries/forecourtJplTransactions.sql.ts'),
    false,
  )
  assert.equal(
    existsSync('src/platform/db/queries/forecourtJplReplay.sql.ts'),
    false,
  )
})

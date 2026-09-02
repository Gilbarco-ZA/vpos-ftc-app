import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildLegacyFiscalizationIdempotencyKey,
  classifyLegacyFiscalizationResponse,
  deriveLegacyFiscalizationEventStatus,
} from '@/src/modules/transactions/domain/fiscalization-backfill'
import { buildFiscalizationCompatibilitySummary } from '@/src/modules/transactions/domain/fiscalization-event'

test('legacy fiscal response classification separates event summaries from payloads', () => {
  const summary = buildFiscalizationCompatibilitySummary({
    eventId: 'event-1',
    status: 'SUCCESS',
    engine: 'legacy',
    transport: 'legacy',
    responsePayload: { status: 'SUCCESS' },
  })
  const summaryResult = classifyLegacyFiscalizationResponse(
    JSON.stringify(summary),
  )
  assert.equal(summaryResult.kind, 'compatibility_summary')

  const payloadResult = classifyLegacyFiscalizationResponse({
    status: 'SUCCESS',
    accessToken: 'secret',
    documentNumber: 'FISCAL-1',
  })
  assert.equal(payloadResult.kind, 'legacy_payload')
  if (payloadResult.kind !== 'legacy_payload') return
  assert.equal((payloadResult.payload as any).accessToken, '[REDACTED]')
  assert.equal(payloadResult.payloadHash.length, 64)
})

test('legacy fiscal status derivation prefers explicit response outcome', () => {
  assert.equal(
    deriveLegacyFiscalizationEventStatus({
      transactionStatus: 'FAILED',
      payload: { result: { status: 'SUCCESS' } },
    }),
    'SUCCESS',
  )
  assert.equal(
    deriveLegacyFiscalizationEventStatus({
      transactionStatus: 'FISCALIZED',
      payload: { response: { status: 'REJECTED' } },
    }),
    'FAILED',
  )
  assert.equal(
    deriveLegacyFiscalizationEventStatus({
      transactionStatus: 'FISCALIZED',
    }),
    'SUCCESS',
  )
})

test('legacy backfill idempotency keys are deterministic and payload-specific', () => {
  const first = buildLegacyFiscalizationIdempotencyKey({
    transactionId: '11111111-1111-4111-8111-111111111111',
    payloadHash: 'a'.repeat(64),
  })
  const repeated = buildLegacyFiscalizationIdempotencyKey({
    transactionId: '11111111-1111-4111-8111-111111111111',
    payloadHash: 'a'.repeat(64),
  })
  const changed = buildLegacyFiscalizationIdempotencyKey({
    transactionId: '11111111-1111-4111-8111-111111111111',
    payloadHash: 'b'.repeat(64),
  })
  assert.equal(first, repeated)
  assert.notEqual(first, changed)
  assert.ok(first.length < 255)
})

test('backfill implementation is bounded, dry-run first and writer-complete', () => {
  const application = readFileSync(
    'src/modules/transactions/application/backfillLegacyFiscalizationEvents.ts',
    'utf8',
  )
  const repository = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/fiscalization-backfill.repository.ts',
    'utf8',
  )
  const cli = readFileSync('scripts/backfill-fiscalization-events.ts', 'utf8')
  const importer = readFileSync(
    'src/modules/setup/infrastructure/legacy-importer/importTransactions.ts',
    'utf8',
  )
  const standaloneImporter = readFileSync('scripts/import-legacy.mjs', 'utf8')

  assert.match(application, /dryRun = input\.dryRun !== false/)
  assert.match(application, /maxBatches/)
  assert.match(application, /findEquivalentFiscalizationEventRepo/)
  assert.match(application, /compactTransactionFiscalizationResponseRepo/)
  assert.match(application, /repairLatestFiscalEventPointersBatchRepo/)
  assert.match(repository, /pg_try_advisory_xact_lock/)
  assert.match(repository, /FOR UPDATE OF t SKIP LOCKED/)
  assert.match(repository, /payload_hash = \$3/)
  assert.match(repository, /JOIN LATERAL/)
  assert.match(cli, /args\.has\('--apply'\)/)
  assert.match(cli, /--all-stations/)
  assert.match(importer, /persistLegacyImportedTransaction/)
  assert.doesNotMatch(
    importer,
    /fiscalization_response,\s*legacy_filename[\s\S]*responsePayload/,
  )
  assert.match(standaloneImporter, /INSERT INTO fiscalization_events/)
  assert.match(standaloneImporter, /fiscalization_response = \$4/)
})

test('Phase 3B migrations add event hash lookup support', () => {
  const postgres = readFileSync(
    'scripts/migrations/postgres/1259_legacy_fiscal_event_backfill.sql',
    'utf8',
  )
  assert.match(postgres, /idx_fisc_events_station_txn_payload_hash/)
  assert.match(postgres, /idx_transactions_fiscal_response_backfill/)
})

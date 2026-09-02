import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('live DOMS buffer capture preserves nested transaction metadata and reset-safe identity', async () => {
  const [normalize, events, service, identity, ingest, migration, replay, replayRepo] =
    await Promise.all([
      read('src/modules/forecourt/infrastructure/normalize.ts'),
      read('src/modules/forecourt/infrastructure/jpl/events.ts'),
      read('src/modules/forecourt/infrastructure/jpl/transactionService.ts'),
      read('src/modules/forecourt/infrastructure/jpl/transactionIdentity.ts'),
      read('src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts'),
      read('scripts/migrations/postgres/1276_doms_transaction_incarnation_identity.sql'),
      read('src/modules/forecourt/infrastructure/jpl/replay.ts'),
      read('src/modules/forecourt/infrastructure/repositories/forecourtJplReplayRepo.ts'),
    ])

  assert.match(normalize, /rootTransPars[\s\S]*FcGradeId/)
  assert.match(events, /transPars[\s\S]*FcGradeId/)
  assert.match(events, /gradeOptionId/)
  assert.match(service, /'56'.*FpGradeOptionNo/)
  assert.match(service, /'73'.*FinishDate/)
  assert.match(service, /'74'.*FinishTime/)

  assert.match(identity, /FcMasterResetDateAndTime/)
  assert.match(identity, /shouldStartNewDomsSequenceIncarnation/)
  assert.match(identity, /finish:/)
  assert.match(identity, /reset:/)

  assert.match(ingest, /doms_transaction_identity/)
  assert.match(
    ingest,
    /ON CONFLICT \(station_id, doms_transaction_identity\)/,
  )
  assert.match(migration, /DROP INDEX IF EXISTS idx_transactions_jpl_recovery_key/)
  assert.match(migration, /idx_transactions_jpl_identity_key/)

  assert.doesNotMatch(replay, /__jplSeenTransactions\.has/)
  assert.match(
    replay,
    /re-reading current DOMS transaction before capture\/clear/,
  )
  assert.match(replayRepo, /checkpoint\.normalized_transaction_id/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lifecycleRepo = readFileSync(
  'src/modules/forecourt/infrastructure/repositories/forecourtPayloadLifecycleRepo.ts',
  'utf8',
)
const ingest = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts',
  'utf8',
)
const replay = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/replay.ts',
  'utf8',
)

test('supervised replay owner update uses contiguous PostgreSQL placeholders', () => {
  const block = lifecycleRepo.match(
    /await query\(\s*`(UPDATE forecourt_jpl_supervised_replay[\s\S]*?)`,\s*\[args\.stationId, args\.fpId, args\.transSeqNo, args\.transactionId\],\s*\)/,
  )

  assert.ok(block, 'expected dedicated supervised replay owner update')

  const placeholders = [...block[1].matchAll(/\$(\d+)/g)].map((match) =>
    Number(match[1]),
  )
  assert.deepEqual([...new Set(placeholders)].sort((a, b) => a - b), [1, 2, 3, 4])
  assert.match(block[1], /normalized_transaction_id = \$4/)
  assert.match(block[1], /station_id = \$1/)
  assert.match(block[1], /fp_id = \$2/)
  assert.match(block[1], /trans_seq_no = \$3/)
})

test('durable transaction row is distinguished from lifecycle ownership failure', () => {
  assert.match(
    ingest,
    /transaction persisted but DOMS lifecycle ownership update failed/,
  )
  assert.match(
    ingest,
    /markNormalizedOwner\([\s\S]*?catch \(ownerError: any\)[\s\S]*?return null/,
  )
})

test('supervised replay advances capture before issuing clear and has no duplicate sequence property', () => {
  assert.match(
    replay,
    /if \(!captured\)[\s\S]*markTransactionCaptured\([\s\S]*replayStage: 'captured'[\s\S]*lifecycleStage: 'captured'[\s\S]*buildClearSupervisedTransactionRequest/,
  )
  assert.doesNotMatch(replay, /transSeqNo,\s*transSeqNo,/)
})

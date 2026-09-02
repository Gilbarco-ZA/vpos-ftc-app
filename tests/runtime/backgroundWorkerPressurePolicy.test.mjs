import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const posWorker = readFileSync(
  'src/modules/pos/infrastructure/posCommandsWorker.ts',
  'utf8',
)
const txWorker = readFileSync(
  'src/modules/transactions/infrastructure/fiscalization/transactionQueueWorker.ts',
  'utf8',
)
const locks = readFileSync('src/platform/db/postgres/locks.ts', 'utf8')
const runtime = readFileSync(
  'src/modules/runtime/infrastructure/inProcessRuntime.ts',
  'utf8',
)

test('high-frequency database workers are single-flight and yield to foreground pool pressure', () => {
  for (const source of [posWorker, txWorker]) {
    assert.match(source, /let loopInFlight = false/)
    assert.match(source, /let heartbeatInFlight = false/)
    assert.match(source, /shouldYieldToForegroundDatabaseWork/)
    assert.match(source, /getPostgresPoolDiagnostics/)
    assert.match(source, /if \(stopRequested \|\| loopInFlight/)
    assert.match(source, /serializeError\(error\)/)
  }
})

test('session advisory locks retain and release the same pooled client', () => {
  assert.match(locks, /__vposPostgresAdvisoryLockClients/)
  assert.match(locks, /const client = await getPool\(\)\.connect\(\)/)
  assert.match(locks, /heldLocks\.set\(key, client\)/)
  assert.match(locks, /const client = heldLocks\.get\(key\)/)
  assert.match(locks, /client\.release\(\)/)
  assert.doesNotMatch(locks, /queryAll/)
})

test('runtime monitor gives newly-started workers a heartbeat grace period', () => {
  assert.match(runtime, /workerStartedAt/)
  assert.match(runtime, /startupGraceMs/)
  assert.match(runtime, /Number\(hb\.pid\) !== process\.pid/)
})

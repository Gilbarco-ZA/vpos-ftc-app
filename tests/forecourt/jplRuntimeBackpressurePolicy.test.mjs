import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lifecycle = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/lifecycle.ts',
  'utf8',
)
const replay = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/replay.ts',
  'utf8',
)
const bufferStatus = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/transactionBufferStatus.ts',
  'utf8',
)
const persistence = readFileSync(
  'src/modules/forecourt/infrastructure/persistence.ts',
  'utf8',
)
const jplPersistence = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/persistence.ts',
  'utf8',
)
const events = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/events.ts',
  'utf8',
)
const requestGate = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/requestGate.ts',
  'utf8',
)

const functionBody = (source, name) => {
  const start = source.indexOf(`const ${name} =`)
  assert.notEqual(start, -1, `${name} must exist`)
  const next = source.indexOf('\nconst ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('fallback buffer reconciliation is low-frequency, bounded, and pressure-aware', () => {
  const poll = functionBody(lifecycle, 'pollJplLiveState')
  const fallback = functionBody(lifecycle, 'startJplFallbackPolling')

  assert.match(poll, /VPOS_JPL_BUFFER_STALE_MS[\s\S]*?180_000/)
  assert.match(poll, /VPOS_JPL_FALLBACK_BUFFER_BATCH[\s\S]*?8/)
  assert.match(poll, /__jplTcpFallbackBufferCursor/)
  assert.match(poll, /hasForecourtPersistencePressure\(\)/)
  assert.match(poll, /data: \{ FpId: '00' \}/)
  assert.match(poll, /await enqueueJplEventProcessing/)
  assert.match(fallback, /VPOS_JPL_FALLBACK_POLL_MS[\s\S]*?60_000/)
})

test('startup buffer reconciliation is paced and reuses the successful transaction-buffer subcode', () => {
  assert.match(replay, /VPOS_JPL_STARTUP_RECONCILIATION_GAP_MS/)
  assert.match(replay, /pauseStartupReconciliation\(\)/)
  assert.match(bufferStatus, /preferredSubCodeStore/)
  assert.match(bufferStatus, /orderedSubCodes/)
  assert.match(bufferStatus, /resetTransactionBufferSubCodePreference/)
  assert.match(bufferStatus, /details\?\.raw\?\.data/)
})

test('forecourt state materialization uses bounded concurrency and coalesces replaceable pump snapshots', () => {
  assert.match(persistence, /__vposForecourtMaterializationQueue/)
  assert.match(persistence, /VPOS_FORECOURT_MATERIALIZATION_CONCURRENCY/)
  assert.match(persistence, /queue\.active < concurrency/)
  assert.match(persistence, /FpStatus_resp/)
  assert.match(persistence, /queue\.coalesced \+= 1/)
  assert.match(persistence, /serializeError\(error\)/)
})


test('JPL database work is bounded before pool acquisition and event replay is single-flight by default', () => {
  assert.match(jplPersistence, /__vposJplPersistenceQueue/)
  assert.match(jplPersistence, /VPOS_JPL_PERSIST_CONCURRENCY/)
  assert.match(jplPersistence, /queue\.active < concurrency/)
  assert.match(jplPersistence, /await enqueueJplPersistence\(args\)/)
  assert.match(events, /__vposJplEventProcessingQueue/)
  assert.match(events, /VPOS_JPL_EVENT_CONCURRENCY/)
  assert.match(events, /if \(!Number\.isFinite\(configured\)\) return 1/)
  assert.match(events, /void handleJplEvent\(job\.eventType, job\.payload\)/)
})


test('direct unsolicited listener owns transaction-buffer updates while solicited sweeps remain owned by their initiator', () => {
  assert.match(lifecycle, /client\.on\('unsolicited', onUnsolicited\)/)
  assert.match(
    lifecycle,
    /name === 'FpSupTransBufStatus_resp'[\s\S]*name === 'FpUnSupTransBufStatus_resp'[\s\S]*buildTransactionBufferEventType\(name, inbound\.subCode\)/,
  )
  assert.doesNotMatch(lifecycle, /new domsJpl\.TransactionBufferWatcher/)
  assert.doesNotMatch(lifecycle, /raw\?\.solicited !== false/)
  assert.doesNotMatch(lifecycle, /latestStoredTransSeqNo/)
  assert.match(lifecycle, /fallback buffer persist failed/)
  assert.match(lifecycle, /startup buffer persist failed/)
  assert.match(lifecycle, /if \(name === 'MultiMessage_resp'\) return/)
})


test('all application solicited JPL requests share a dynamic single-flight gate when correlation is unavailable', () => {
  assert.match(lifecycle, /createJplSolicitedRequestGate/)
  assert.match(lifecycle, /await requestGate\.run/)
  assert.match(lifecycle, /VPOS_JPL_REQUEST_CONCURRENCY/)
  assert.match(requestGate, /strict-single-flight/)
  assert.match(requestGate, /correlated-concurrent/)
  assert.match(requestGate, /active < diagnostics\.concurrency/)
})

test('recent post-clear buffer snapshots are suppressed without making DEC4 sequence reuse permanently terminal', () => {
  assert.match(replay, /shouldSuppressRecentlyClearedOwnedReplay/)
  assert.match(replay, /VPOS_JPL_RECENT_CLEAR_STALE_GRACE_MS/)
  assert.match(replay, /isTransactionNotFoundReject/)
  assert.match(replay, /stale DOMS buffer snapshot/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const gateway = read('src/modules/forecourt/infrastructure/core/gateway.ts')
const lifecycle = read('src/modules/forecourt/infrastructure/jpl/lifecycle.ts')
const lease = read('src/modules/forecourt/infrastructure/jpl/posSessionLease.ts')
const languages = read('src/shared/server/i18n/languages.ts')
const server = read('server.ts')

const sourceBetween = (source, start, end) => {
  const first = source.indexOf(start)
  const last = source.indexOf(end, first + start.length)
  assert.ok(first >= 0 && last > first, 'could not extract production implementation')
  return source.slice(first, last)
}

test('unavailable JPL startup is caught at both fire-and-forget gateway entrypoints', async () => {
  assert.match(gateway, /void startJplTcpAdapter\(\)\.catch\(/)
  assert.equal((gateway.match(/startGatewayAdapter\(\)/g) ?? []).length, 2)

  const implementation = sourceBetween(
    gateway, 'const startGatewayAdapter = () => {', '\nexport const ensureGatewayStarted',
  )
  const warnings = []
  const startGatewayAdapter = runInNewContext(
    implementation + '\nstartGatewayAdapter',
    {
      startJplTcpAdapter: () => Promise.reject(new Error('JPL lease busy')),
      logger: { warn: (...args) => warnings.push(args) },
      serializeError: (error) => ({ message: error.message }),
    },
  )

  startGatewayAdapter()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0][1].error.message, /lease busy/)
})

test('JPL POS lease refusal remains fail-closed but schedules retry/backoff', () => {
  const busy = sourceBetween(
    lifecycle, '  if (!posSessionLease) {', '\n  globalThis.__jplPosSessionLease = posSessionLease',
  )
  assert.match(busy, /lastDisconnectReason: 'pos_session_lease_busy'/)
  assert.match(busy, /scheduleReconnect\(stationId, 'pos_session_lease_busy'\)/)
  assert.match(busy, /throw error/)
  assert.match(lifecycle, /const scheduleReconnect =/)
  assert.match(lifecycle, /calculateJplReconnectDelay/)
  assert.match(lease, /forecourt_jpl_pos_sessions\.expires_at <= NOW\(\)/)
  assert.match(lease, /forecourt_jpl_pos_sessions\.owner_id = EXCLUDED\.owner_id/)
  assert.match(lease, /WHERE station_id = \$1 AND pos_id = \$2 AND owner_id = \$3/)
})

test('regular stop and suspend await owner-matched JPL disconnect and release', () => {
  assert.match(server, /await \(runtime\?\.stop\(\) \?\? Promise\.resolve\(\)\)/)
  assert.match(server, /await shutdownJplTcpAdapter\(\)/)
  const stop = sourceBetween(
    lifecycle, 'export const shutdownJplTcpAdapter =', '\nconst scheduleReconnect =',
  )
  assert.match(stop, /await detachClient\(globalThis\.__jplTcpClient\)/)
  assert.match(stop, /await releaseJplPosSessionLease\(lease\)/)
  assert.match(stop, /if \(!physicallyClosed\)/)
  assert.match(lifecycle, /if \(releaseLease && !physicallyClosed\)/)
  assert.ok(
    stop.indexOf('await detachClient(') < stop.indexOf('await releaseJplPosSessionLease(lease)'),
    'lease must not be released before the physical socket closes',
  )
  assert.match(stop, /__jplTcpShutdownPromise/)
  assert.match(stop, /clearPosSessionHeartbeat\(\)/)
})

test('failed i18n bootstrap is retried; concurrent callers share attempt and success stays cached', async () => {
  const implementation = sourceBetween(
    languages, 'export const bootstrapDefaultLanguages = async () => {',
    '\nexport const listLanguages =',
  ).replace(/^export const /, 'const ')

  let attempts = 0
  const bootstrap = runInNewContext(
    'let bootstrapPromise = null;\n' + implementation + '\nbootstrapDefaultLanguages',
    {
      DEFAULT_LANGUAGES: [],
      withTransaction: async (fn) => {
        attempts++
        if (attempts === 1) throw new Error('timeout exceeded when trying to connect')
        return await fn({ query: async () => ({}) })
      },
    },
  )

  const results = await Promise.allSettled([bootstrap(), bootstrap()])
  assert.equal(attempts, 1, 'concurrent requests should share a single attempt')
  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[0].reason.message, /timeout exceeded/)

  await bootstrap()
  assert.equal(attempts, 2, 'next page request must be able to retry')
  await bootstrap()
  assert.equal(attempts, 2, 'successful initialization remains cached')
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lifecycle = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/lifecycle.ts',
  'utf8',
)
const globals = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/globals.ts',
  'utf8',
)
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

const functionBody = (name) => {
  const start = lifecycle.indexOf(`const ${name} =`)
  assert.notEqual(start, -1, `${name} must exist`)
  const next = lifecycle.indexOf('\nconst ', start + 1)
  return lifecycle.slice(start, next === -1 ? lifecycle.length : next)
}

test('master keeps controller-wide FpStatus polling and conservative fallback cadence', () => {
  const poll = functionBody('pollJplLiveState')
  const fallback = functionBody('startJplFallbackPolling')

  assert.match(poll, /name: 'FpStatus_req'[\s\S]*?data: \{ FpId: '00' \}/)
  assert.match(poll, /lastStatusAt[\s\S]*?staleAfterMs[\s\S]*?continue/)
  assert.match(fallback, /VPOS_JPL_FALLBACK_POLL_MS/)
  assert.match(fallback, /60_000/)
  assert.match(poll, /VPOS_JPL_FALLBACK_BUFFER_BATCH/)
  assert.match(poll, /VPOS_JPL_BUFFER_STALE_MS/)
  assert.doesNotMatch(fallback, /initial fallback poll failed/)
  assert.doesNotMatch(lifecycle, /routePolledEnvelope/)
  assert.match(
    poll,
    /vendor client emits every matched response through `message` before[\s\S]*?must not route the returned response a second time/,
  )
})

test('reconnect closes physical JPL client before lease release and replacement', () => {
  const detach = functionBody('detachClient')
  const disconnected = functionBody('markDisconnected')

  assert.match(detach, /const detachClient = async/)
  assert.match(detach, /await \(activeClient as any\)\?\.disconnect\?\.\(\)/)
  assert.match(
    disconnected,
    /await detachClient\(client\)[\s\S]*?await releaseLease\(\)[\s\S]*?scheduleReconnect/,
  )
  assert.match(globals, /__jplTcpTeardownPromise/)
  assert.match(lifecycle, /if \(teardown\) await teardown/)
})

test('POS lease heartbeat is independent from fallback polling and shutdown closes current client', () => {
  const monitors = functionBody('clearConnectionMonitors')
  const fallback = functionBody('startJplFallbackPolling')
  const handlers = functionBody('attachProcessHandlers')

  assert.doesNotMatch(monitors, /__jplPosSessionHeartbeatTimer/)
  assert.doesNotMatch(fallback, /__jplPosSessionHeartbeatTimer/)
  assert.match(lifecycle, /const clearPosSessionHeartbeat =/)
  assert.match(handlers, /const activeClient = globalThis\.__jplTcpClient/)
})

test('vendor JPL version includes the uncorrelated-response compatibility fix', () => {
  assert.equal(packageJson.dependencies['@gilbarcoafs/doms-pos-jpl'], '^1.1.16')
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('transaction buffer monitoring keeps ETS SUBC 03 as the preferred path', () => {
  const bootstrap = read(
    'src/modules/forecourt/infrastructure/jpl/protocol/bootstrap.ts',
  )
  const policy = read(
    'src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy.ts',
  )
  const lifecycle = read(
    'src/modules/forecourt/infrastructure/jpl/lifecycle.ts',
  )

  assert.match(bootstrap, /UNSO_TRBUFSTA_3/)
  assert.match(policy, /\['03H',\s*'01H',\s*'00H'\]/)
  assert.match(lifecycle, /requestTransactionBufferStatusWithFallback/)
  assert.match(lifecycle, /for \(const sourceMode of \['supervised', 'unsupervised'\]/)

  const pollStart = lifecycle.indexOf('const pollJplLiveState')
  const pollEnd = lifecycle.indexOf('const startJplFallbackPolling', pollStart)
  const poll = lifecycle.slice(pollStart, pollEnd)
  assert.doesNotMatch(poll, /FpSupTransBufStatus_req[\s\S]*subCode: '00H'/)
  assert.doesNotMatch(poll, /FpUnSupTransBufStatus_req[\s\S]*subCode: '00H'/)
})

test('DPP access errors do not permanently disable later transaction capture', () => {
  const replay = read('src/modules/forecourt/infrastructure/jpl/replay.ts')
  const replayState = read(
    'src/modules/forecourt/infrastructure/jpl/replayState.ts',
  )
  const lifecycle = read(
    'src/modules/forecourt/infrastructure/jpl/lifecycle.ts',
  )

  assert.match(replay, /return rejectCode === '03H'/)
  assert.doesNotMatch(replay, /request rejected\/i/)
  assert.doesNotMatch(
    replay,
    /markReplayCapability\('supervised', 'denied'\)/,
  )
  assert.doesNotMatch(
    replay,
    /markReplayCapability\('unsupervised', 'denied'\)/,
  )
  assert.match(replay, /temporarily unavailable/)

  assert.match(replayState, /export const resetReplayCapabilities/)
  assert.match(replayState, /capabilities\.supervised = 'unknown'/)
  assert.match(replayState, /capabilities\.unsupervised = 'unknown'/)
  assert.match(lifecycle, /resetReplayCapabilities\(\)/)
})

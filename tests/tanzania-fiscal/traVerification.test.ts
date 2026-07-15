import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getTraVerificationCode,
  getTraVerificationUrl,
  resetTraVfdStatusForTests,
  resolveTraAvailabilityEndpoint,
  resolveTraVerificationBaseUrl,
  traVfdStatusOverview,
} from '../../src/modules/tanzania-fiscal/infrastructure/traVerification'

test('builds TRA receipt verification codes with package-compatible time handling', () => {
  assert.equal(getTraVerificationCode('2E9LT636'), '2E9LT636')
  assert.equal(
    getTraVerificationCode('2E9LT636', '17:29:01'),
    '2E9LT636_172901',
  )
})

test('builds production and virtual TRA verification URLs', () => {
  assert.equal(
    resolveTraVerificationBaseUrl({ baseUrl: 'https://vfd.tra.go.tz' }),
    'https://verify.tra.go.tz/',
  )
  assert.equal(
    resolveTraVerificationBaseUrl({ baseUrl: 'https://virtual.tra.go.tz' }),
    'https://virtual.tra.go.tz/efdmsRctVerify/',
  )
  assert.equal(
    getTraVerificationUrl('2E9LT636', '17:29:01', {
      baseUrl: 'https://virtual.tra.go.tz',
    }),
    'https://virtual.tra.go.tz/efdmsRctVerify/2E9LT636_172901',
  )
})

test('resolves TRA status check endpoint through the token path', () => {
  assert.equal(
    resolveTraAvailabilityEndpoint('https://vfd.tra.go.tz'),
    'https://vfd.tra.go.tz/vfdtoken',
  )
  assert.equal(
    resolveTraAvailabilityEndpoint('https://vfd.tra.go.tz/api/efdmsRctInfo'),
    'https://vfd.tra.go.tz/vfdtoken',
  )
})

test('keeps package-compatible TRA VFD status overview and last-success timestamps', async () => {
  resetTraVfdStatusForTests()
  const now = new Date('2026-07-08T08:00:00.000Z')
  const calls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input))
    return new Response(null, { status: 204 })
  }

  const status = await traVfdStatusOverview({
    baseUrl: 'https://vfd.tra.go.tz',
    internetCheckUrl: 'https://vpos.site',
    now,
    fetchImpl,
  })

  assert.equal(status.internet, true)
  assert.equal(status.tra, true)
  assert.equal(status.lastInternetConnection?.toISOString(), now.toISOString())
  assert.equal(status.lastTraConnection?.toISOString(), now.toISOString())
  assert.deepEqual(calls, [
    'https://vpos.site',
    'https://vfd.tra.go.tz/vfdtoken',
  ])
})

test('preserves last-success timestamps when a later TRA status check fails', async () => {
  resetTraVfdStatusForTests()
  const first = new Date('2026-07-08T08:00:00.000Z')
  const second = new Date('2026-07-08T08:05:00.000Z')

  await traVfdStatusOverview({
    baseUrl: 'https://vfd.tra.go.tz',
    now: first,
    fetchImpl: async () => new Response('', { status: 200 }),
  })

  let call = 0
  const status = await traVfdStatusOverview({
    baseUrl: 'https://vfd.tra.go.tz',
    now: second,
    fetchImpl: async () => {
      call += 1
      if (call === 1) return new Response('', { status: 200 })
      throw new Error('network down')
    },
  })

  assert.equal(status.internet, true)
  assert.equal(status.tra, false)
  assert.equal(status.lastInternetConnection?.toISOString(), second.toISOString())
  assert.equal(status.lastTraConnection?.toISOString(), first.toISOString())
  assert.match(status.checks.tra.error ?? '', /network down/)
})

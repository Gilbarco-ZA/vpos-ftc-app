import assert from 'node:assert/strict'
import test from 'node:test'

import { assertJplAccessAllowed } from '@/src/shared/integrations/jplAccess'

test('forecourt JPL access bypasses POS backend guard when JPL is configured', async () => {
  let posGuardCalls = 0

  const result = await assertJplAccessAllowed('station-1', 'forecourt', {
    assertPosBackendAllowed: async () => {
      posGuardCalls += 1
      return 'jpl'
    },
    getJplConfig: async () => (({
      host: '127.0.0.1'
    }) as any),
  })

  assert.equal(result, 'jpl')
  assert.equal(posGuardCalls, 0)
})

test('POS JPL access still requires the POS backend guard', async () => {
  let posGuardCalls = 0

  const result = await assertJplAccessAllowed('station-1', 'pos', {
    assertPosBackendAllowed: async () => {
      posGuardCalls += 1
      return 'jpl'
    },
    getJplConfig: async () => (({
      host: '127.0.0.1'
    }) as any),
  })

  assert.equal(result, 'jpl')
  assert.equal(posGuardCalls, 1)
})

test('forecourt JPL access fails cleanly when JPL is not configured', async () => {
  await assert.rejects(
    () =>
      assertJplAccessAllowed('station-1', 'forecourt', {
        assertPosBackendAllowed: async () => 'jpl',
        getJplConfig: async () => null,
      }),
    /JPL is not configured/,
  )
})

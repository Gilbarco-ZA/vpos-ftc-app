import assert from 'node:assert/strict'
import test from 'node:test'
import { IdlePollPolicy } from '@/src/shared/runtime/idle-poll-policy'

test('empty polls back off to a bound and active work restores base interval', () => {
  let now = 0
  const policy = new IdlePollPolicy(500, 5000, () => now)
  assert.equal(policy.ready(), true)
  for (const expected of [1000, 2000, 4000, 5000, 5000]) {
    policy.completed(false)
    assert.equal(policy.delayMs, expected)
    assert.equal(policy.ready(), false)
    now += expected
    assert.equal(policy.ready(), true)
  }
  policy.completed(true)
  assert.equal(policy.delayMs, 500)
  policy.reset()
  assert.equal(policy.ready(), true)
})

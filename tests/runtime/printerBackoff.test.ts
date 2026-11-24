import assert from 'node:assert/strict'
import test from 'node:test'
import { PrinterBackoff } from '@/src/modules/printing/infrastructure/printer-backoff'

test('failed destination and deferred jobs expire without blocking other destinations', () => {
  let now = 100
  const policy = new PrinterBackoff(() => now)
  const until = policy.fail('printer-a', 30000)
  policy.defer('job-a', until)
  assert.equal(policy.blockedUntil('printer-a'), 30100)
  assert.equal(policy.blockedUntil('printer-b'), 0)
  assert.deepEqual(policy.excludedIds(), ['job-a'])
  now = 30100
  assert.equal(policy.blockedUntil('printer-a'), 0)
  assert.deepEqual(policy.excludedIds(), [])
})

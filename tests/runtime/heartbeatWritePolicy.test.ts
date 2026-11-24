import assert from 'node:assert/strict'
import test from 'node:test'
import { HeartbeatWritePolicy } from '@/src/shared/runtime/heartbeat-write-policy'

test('periodic unchanged heartbeats coalesce, transitions persist immediately', async () => {
  let now = 0
  let writes = 0
  const policy = new HeartbeatWritePolicy(5000, () => now)
  const persist = async () => { writes++ }
  await policy.write('worker', 'running', persist)
  now = 4999
  await policy.write('worker', 'running', persist)
  assert.equal(writes, 1)
  await policy.write('worker', 'error', persist)
  assert.equal(writes, 2)
  now += 5000
  await policy.write('worker', 'error', persist)
  assert.equal(writes, 3)
})

test('concurrent writes coalesce and failed writes do not advance liveness', async () => {
  const policy = new HeartbeatWritePolicy(5000, () => 0)
  let writes = 0
  await assert.rejects(policy.write('worker', 'running', async () => { throw new Error('db') }))
  await Promise.all(Array.from({ length: 10 }, () =>
    policy.write('worker', 'running', async () => { writes++ }),
  ))
  assert.equal(writes, 1)
})

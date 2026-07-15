import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  beginReplayKey,
  endReplayKey,
  getReplayConcurrencySnapshot,
  resetReplayConcurrencyState,
  withReplayLock,
} from '../../src/modules/forecourt/infrastructure/jpl/replayState'

const delay = async (milliseconds: number) =>
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

describe('DOMS replay concurrency state', () => {
  it('serializes work for one key and removes the completed lock tail', async () => {
    resetReplayConcurrencyState()
    const order: string[] = []

    await Promise.all([
      withReplayLock('station-a:supervised:01', async () => {
        order.push('first:start')
        await delay(20)
        order.push('first:end')
      }),
      withReplayLock('station-a:supervised:01', async () => {
        order.push('second:start')
        order.push('second:end')
      }),
    ])

    assert.deepEqual(order, [
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
    assert.deepEqual(getReplayConcurrencySnapshot(), {
      queuedLockCount: 0,
      inFlightKeyCount: 0,
    })
  })

  it('allows unrelated station keys to run concurrently', async () => {
    resetReplayConcurrencyState()
    const order: string[] = []

    await Promise.all([
      withReplayLock('station-a:supervised:01', async () => {
        order.push('a:start')
        await delay(20)
        order.push('a:end')
      }),
      withReplayLock('station-b:supervised:01', async () => {
        order.push('b:start')
        await delay(5)
        order.push('b:end')
      }),
    ])

    assert.ok(order.indexOf('b:start') < order.indexOf('a:end'))
    assert.deepEqual(getReplayConcurrencySnapshot(), {
      queuedLockCount: 0,
      inFlightKeyCount: 0,
    })
  })

  it('rejects duplicate in-flight identities and releases them for retry', () => {
    resetReplayConcurrencyState()
    assert.equal(beginReplayKey('station-a:supervised:01:0001'), true)
    assert.equal(beginReplayKey('station-a:supervised:01:0001'), false)
    assert.equal(beginReplayKey('station-b:supervised:01:0001'), true)

    endReplayKey('station-a:supervised:01:0001')
    assert.equal(beginReplayKey('station-a:supervised:01:0001'), true)

    resetReplayConcurrencyState()
  })
})

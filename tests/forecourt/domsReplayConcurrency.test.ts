import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  beginReplayKey,
  endReplayKey,
  getReplayConcurrencySnapshot,
  resetReplayConcurrencyState,
  withReplayLock,
} from '../../src/modules/forecourt/infrastructure/jpl/replayState'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('DOMS replay concurrency state', () => {
  it('serializes work for one key and removes the completed lock tail', async () => {
    resetReplayConcurrencyState()
    const order: string[] = []
    const firstStarted = deferred()
    const releaseFirst = deferred()

    const first = withReplayLock('station-a:supervised:01', async () => {
      order.push('first:start')
      firstStarted.resolve()
      await releaseFirst.promise
      order.push('first:end')
    })

    await firstStarted.promise
    const second = withReplayLock('station-a:supervised:01', async () => {
      order.push('second:start')
      order.push('second:end')
    })

    await Promise.resolve()
    assert.deepEqual(order, ['first:start'])

    releaseFirst.resolve()
    await Promise.all([first, second])

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
    const stationAStarted = deferred()
    const stationBStarted = deferred()
    const releaseStationA = deferred()

    const stationA = withReplayLock(
      'station-a:supervised:01',
      async () => {
        order.push('a:start')
        stationAStarted.resolve()
        await releaseStationA.promise
        order.push('a:end')
      },
    )
    const stationB = withReplayLock(
      'station-b:supervised:01',
      async () => {
        order.push('b:start')
        stationBStarted.resolve()
        order.push('b:end')
      },
    )

    await Promise.all([stationAStarted.promise, stationBStarted.promise])
    assert.ok(order.includes('b:end'))
    assert.equal(order.includes('a:end'), false)

    releaseStationA.resolve()
    await Promise.all([stationA, stationB])

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

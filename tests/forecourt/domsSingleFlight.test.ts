import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runSingleFlight } from '../../src/modules/forecourt/infrastructure/jpl/singleFlight'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('DOMS station-scoped single-flight execution', () => {
  it('shares one run for duplicate station requests and releases the registry', async () => {
    const registry = new Map<string, Promise<number>>()
    const started = deferred()
    const release = deferred()
    let calls = 0

    const run = async () => {
      calls += 1
      started.resolve()
      await release.promise
      return 42
    }

    const first = runSingleFlight({ registry, key: 'station-a', run })
    await started.promise
    const second = runSingleFlight({ registry, key: 'station-a', run })

    assert.equal(calls, 1)
    release.resolve()

    assert.deepEqual(await Promise.all([first, second]), [42, 42])
    assert.equal(calls, 1)
    assert.equal(registry.size, 0)
  })

  it('does not collapse recovery work for different stations', async () => {
    const registry = new Map<string, Promise<string>>()
    const started: string[] = []
    const stationAStarted = deferred()
    const stationBStarted = deferred()
    const releaseBoth = deferred()

    const stationA = runSingleFlight({
      registry,
      key: 'station-a',
      run: async () => {
        started.push('station-a')
        stationAStarted.resolve()
        await releaseBoth.promise
        return 'a'
      },
    })
    const stationB = runSingleFlight({
      registry,
      key: 'station-b',
      run: async () => {
        started.push('station-b')
        stationBStarted.resolve()
        await releaseBoth.promise
        return 'b'
      },
    })

    await Promise.all([stationAStarted.promise, stationBStarted.promise])
    assert.deepEqual(new Set(started), new Set(['station-a', 'station-b']))

    releaseBoth.resolve()
    assert.deepEqual(await Promise.all([stationA, stationB]), ['a', 'b'])
    assert.equal(registry.size, 0)
  })

  it('releases failed work so a later retry can run', async () => {
    const registry = new Map<string, Promise<number>>()
    await assert.rejects(
      runSingleFlight({
        registry,
        key: 'station-a',
        run: async () => {
          throw new Error('failed')
        },
      }),
      /failed/,
    )
    assert.equal(registry.size, 0)

    const result = await runSingleFlight({
      registry,
      key: 'station-a',
      run: async () => 7,
    })
    assert.equal(result, 7)
  })
})

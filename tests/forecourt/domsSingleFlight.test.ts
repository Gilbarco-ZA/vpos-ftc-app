import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runSingleFlight } from '../../src/modules/forecourt/infrastructure/jpl/singleFlight'

const delay = async (milliseconds: number) =>
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

describe('DOMS station-scoped single-flight execution', () => {
  it('shares one run for duplicate station requests and releases the registry', async () => {
    const registry = new Map<string, Promise<number>>()
    let calls = 0
    const run = async () => {
      calls += 1
      await delay(10)
      return 42
    }

    const [first, second] = await Promise.all([
      runSingleFlight({ registry, key: 'station-a', run }),
      runSingleFlight({ registry, key: 'station-a', run }),
    ])

    assert.equal(first, 42)
    assert.equal(second, 42)
    assert.equal(calls, 1)
    assert.equal(registry.size, 0)
  })

  it('does not collapse recovery work for different stations', async () => {
    const registry = new Map<string, Promise<string>>()
    const started: string[] = []

    const [stationA, stationB] = await Promise.all([
      runSingleFlight({
        registry,
        key: 'station-a',
        run: async () => {
          started.push('station-a')
          await delay(15)
          return 'a'
        },
      }),
      runSingleFlight({
        registry,
        key: 'station-b',
        run: async () => {
          started.push('station-b')
          await delay(5)
          return 'b'
        },
      }),
    ])

    assert.deepEqual(new Set(started), new Set(['station-a', 'station-b']))
    assert.equal(stationA, 'a')
    assert.equal(stationB, 'b')
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

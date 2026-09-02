import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createJplSolicitedRequestGate } from '../../src/modules/forecourt/infrastructure/jpl/requestGate'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('JPL solicited request gate', () => {
  it('serializes all requests when correlation is unavailable', async () => {
    const client = {
      getRequestDispatchMode: () => 'strict-single-flight',
    }
    const gate = createJplSolicitedRequestGate({ client, maxConcurrent: 8 })
    let active = 0
    let maxActive = 0

    const run = () =>
      gate.run(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      })

    await Promise.all([run(), run(), run(), run()])
    assert.equal(maxActive, 1)
    assert.deepEqual(gate.getDiagnostics(), {
      mode: 'strict-single-flight',
      concurrency: 1,
      active: 0,
      queued: 0,
    })
  })

  it('fails safe to single-flight when vendor dispatch-mode inspection throws', async () => {
    const client = {
      getRequestDispatchMode: () => {
        throw new Error('correlation capability unavailable')
      },
      getServerSupportsCorrelationIds: () => false,
    }
    const gate = createJplSolicitedRequestGate({ client, maxConcurrent: 8 })

    assert.deepEqual(gate.getDiagnostics(), {
      mode: 'strict-single-flight',
      concurrency: 1,
      active: 0,
      queued: 0,
    })
  })

  it('allows bounded concurrency when correlation is available', async () => {
    const client = {
      getRequestDispatchMode: () => 'correlated-concurrent',
    }
    const gate = createJplSolicitedRequestGate({ client, maxConcurrent: 3 })
    let active = 0
    let maxActive = 0

    const run = () =>
      gate.run(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      })

    await Promise.all([run(), run(), run(), run(), run()])
    assert.equal(maxActive, 3)
  })

  it('stops dispatching queued work concurrently after the client falls back to uncorrelated mode', async () => {
    let mode: 'correlated-concurrent' | 'strict-single-flight' =
      'correlated-concurrent'
    const client = {
      getRequestDispatchMode: () => mode,
    }
    const gate = createJplSolicitedRequestGate({ client, maxConcurrent: 2 })
    const first = deferred()
    const second = deferred()
    const starts: string[] = []

    const p1 = gate.run(async () => {
      starts.push('first')
      await first.promise
    })
    const p2 = gate.run(async () => {
      starts.push('second')
      await second.promise
    })

    await Promise.resolve()
    assert.deepEqual(starts, ['first', 'second'])

    mode = 'strict-single-flight'
    const p3 = gate.run(async () => {
      starts.push('third')
    })

    await Promise.resolve()
    assert.deepEqual(starts, ['first', 'second'])

    first.resolve()
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(starts, ['first', 'second'])

    second.resolve()
    await Promise.all([p1, p2, p3])
    assert.deepEqual(starts, ['first', 'second', 'third'])
  })
})

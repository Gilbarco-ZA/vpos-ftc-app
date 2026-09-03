import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { JplClientRuntimeDeps } from '@/src/platform/integrations/jpl/commands/contracts'

import {
  createGatewayStartCoordinator,
  createSerializedCommandQueue,
  prepareJplCommandExecution,
} from '@/src/platform/integrations/jpl/orchestration'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createRuntime = (
  overrides: Partial<JplClientRuntimeDeps> = {},
): JplClientRuntimeDeps => ({
  assertAccessAllowed: async () => undefined,
  getGatewayState: () => ({ started: true }),
  ensureGatewayStarted: async () => undefined,
  getClient: () => ({ request: async () => ({ ok: true }) }),
  getConfig: async () => ({}),
  getReplayStatus: async () => ({}),
  ...overrides,
})

describe('JPL command orchestration', () => {
  it('serializes commands without starting the next task early', async () => {
    const queue = createSerializedCommandQueue()
    const firstRelease = deferred<void>()
    const firstStarted = deferred<void>()
    const events: string[] = []

    const first = queue.enqueue(async () => {
      events.push('first-start')
      firstStarted.resolve()
      await firstRelease.promise
      events.push('first-end')
      return 'first'
    })
    const second = queue.enqueue(async () => {
      events.push('second-start')
      return 'second'
    })

    await firstStarted.promise
    assert.deepEqual(events, ['first-start'])

    firstRelease.resolve()
    assert.equal(await first, 'first')
    assert.equal(await second, 'second')
    assert.deepEqual(events, ['first-start', 'first-end', 'second-start'])
  })

  it('continues the queue after a rejected command', async () => {
    const queue = createSerializedCommandQueue()
    const events: string[] = []

    const failed = queue.enqueue(async () => {
      events.push('failed')
      throw new Error('controller rejected command')
    })
    const recovered = queue.enqueue(async () => {
      events.push('recovered')
      return 42
    })

    await assert.rejects(failed, /controller rejected command/)
    assert.equal(await recovered, 42)
    assert.deepEqual(events, ['failed', 'recovered'])
  })

  it('coalesces concurrent gateway starts into one in-flight operation', async () => {
    const coordinator = createGatewayStartCoordinator()
    const release = deferred<void>()
    let starts = 0
    const start = async () => {
      starts += 1
      await release.promise
    }

    const first = coordinator.ensureStarted(start)
    const second = coordinator.ensureStarted(start)
    assert.equal(starts, 0)

    await Promise.resolve()
    assert.equal(starts, 1)
    release.resolve()
    await Promise.all([first, second])
    assert.equal(starts, 1)
  })

  it('allows a later gateway start after an in-flight failure', async () => {
    const coordinator = createGatewayStartCoordinator()
    let starts = 0

    await assert.rejects(
      coordinator.ensureStarted(async () => {
        starts += 1
        throw new Error('gateway unavailable')
      }),
      /gateway unavailable/,
    )

    await coordinator.ensureStarted(async () => {
      starts += 1
    })
    assert.equal(starts, 2)
  })

  it('returns controlled startup and missing-client results', async () => {
    const coordinator = createGatewayStartCoordinator()
    const failed = await prepareJplCommandExecution(
      createRuntime({
        getGatewayState: () => ({ started: false }),
        ensureGatewayStarted: async () => {
          throw new Error('controller offline')
        },
      }),
      coordinator,
    )
    assert.deepEqual(failed, {
      ok: false,
      result: { ok: false, accepted: false, error: 'controller offline' },
    })

    let recoveryStarts = 0
    const missing = await prepareJplCommandExecution(
      createRuntime({
        getClient: () => null,
        ensureGatewayStarted: async () => {
          recoveryStarts += 1
        },
      }),
      createGatewayStartCoordinator(),
    )
    assert.equal(recoveryStarts, 1)
    assert.deepEqual(missing, {
      ok: false,
      result: {
        ok: false,
        accepted: false,
        error: 'APC1 client not available after gateway recovery',
      },
    })
  })

  it('recovers a missing client even when gateway state still reports started', async () => {
    const client = { request: async () => ({ ok: true }) }
    let currentClient: typeof client | null = null
    let recoveryStarts = 0
    const runtime = createRuntime({
      getGatewayState: () => ({ started: true }),
      getClient: () => currentClient,
      ensureGatewayStarted: async () => {
        recoveryStarts += 1
        currentClient = client
      },
    })

    const prepared = await prepareJplCommandExecution(
      runtime,
      createGatewayStartCoordinator(),
    )
    assert.equal(recoveryStarts, 1)
    assert.equal(prepared.ok, true)
    if (prepared.ok) assert.equal(prepared.client, client)
  })

  it('returns the client after a successful single-flight start', async () => {
    const client = { request: async () => ({ ok: true }) }
    let started = false
    const runtime = createRuntime({
      getGatewayState: () => ({ started }),
      ensureGatewayStarted: async () => {
        started = true
      },
      getClient: () => client,
    })

    const prepared = await prepareJplCommandExecution(
      runtime,
      createGatewayStartCoordinator(),
    )
    assert.equal(prepared.ok, true)
    if (prepared.ok) assert.equal(prepared.client, client)
  })
})

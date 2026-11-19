import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { awaitQueuesDrained } = require('../../src/platform/runtime/persist-readiness.cjs')

function q(active = 0, queued = 0, failed = 0) {
  return [{ active, queued, failed }]
}

test('suspend readiness acknowledges only stable idle queues and a healthy database', async () => {
  let checked = 0
  const result = await awaitQueuesDrained(
    () => q(),
    async () => { checked++; return true },
    { timeoutMs: 500, pollMs: 5, requiredStableSamples: 3 },
  )
  assert.deepEqual(result, { ok: true, status: 'persisted' })
  assert.equal(checked, 1)
})

test('suspend readiness waits for pending and active writes to drain', async () => {
  let calls = 0
  const result = await awaitQueuesDrained(
    () => {
      calls++
      return calls < 3 ? q(1, 2, 0) : q()
    },
    async () => true,
    { timeoutMs: 500, pollMs: 5, requiredStableSamples: 2 },
  )
  assert.equal(result.ok, true)
  assert.ok(calls >= 4)
})

test('suspend readiness blocks when persistence queue has reported failures', async () => {
  const result = await awaitQueuesDrained(
    () => q(0, 0, 1),
    async () => true,
    { timeoutMs: 200, pollMs: 5, requiredStableSamples: 1 },
  )
  assert.equal(result.ok, false)
  assert.match(result.reason, /failures/)
})

test('suspend readiness blocks when PostgreSQL is unavailable', async () => {
  const result = await awaitQueuesDrained(
    () => q(),
    async () => false,
    { timeoutMs: 200, pollMs: 5, requiredStableSamples: 2 },
  )
  assert.equal(result.ok, false)
  assert.match(result.reason, /PostgreSQL/)
})

test('suspend readiness blocks rather than guessing after a timeout', async () => {
  const result = await awaitQueuesDrained(
    () => q(1, 0, 0),
    async () => true,
    { timeoutMs: 25, pollMs: 5, requiredStableSamples: 2 },
  )
  assert.equal(result.ok, false)
  assert.match(result.reason, /timeout/)
})

test('suspend readiness rejects missing or malformed queue diagnostics', async () => {
  for (const diagnostics of [[], [null], [{ active: -1, queued: 0, failed: 0 }]]) {
    const result = await awaitQueuesDrained(
      () => diagnostics, async () => true,
      { timeoutMs: 200, pollMs: 5, requiredStableSamples: 1 },
    )
    assert.equal(result.ok, false)
  }
})

test('FTC is wired to a token-protected loopback suspend endpoint and blocks incoming work', () => {
  const server = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8')
  const ws = readFileSync(new URL('../../server/forecourtWs.ts', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../../.config/config.js', import.meta.url), 'utf8')
  assert.match(server, /isLoopback\(req\.socket\.remoteAddress\)/)
  assert.match(server, /req\.headers\['x-vpos-lifecycle-token'\] !== lifecycleToken/)
  assert.match(server, /await withinDeadline\(stopRuntimeOnce\(\), 9000\)/)
  assert.match(server, /checkPostgresHealth/)
  assert.match(server, /return sendJson\(res, 503, \{ ok: false, status: 'suspending' \}\)/)
  assert.match(ws, /globalThis\.__vposLifecycleSuspending/)
  assert.match(config, /enableNodeWebPersistHook:/)
  assert.match(config, /persistHookPort: 3080/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('src/platform/db/postgres/core.ts', 'utf8')
const config = readFileSync('src/platform/config/app-config.ts', 'utf8')
const defaults = readFileSync('src/platform/runtime/env-defaults.cjs', 'utf8')

test('PostgreSQL pool is process-global across compiled module graphs', () => {
  assert.match(core, /__vposPostgresPool/)
  assert.match(core, /globalThis as PostgresPoolGlobals/)
  assert.doesNotMatch(core, /let pool: Pool \| null = null/)
  assert.match(core, /getPostgresPoolDiagnostics/)
  assert.match(core, /waitingCount:/)
})

test('master-compatible pool defaults are configurable and bounded', () => {
  assert.match(config, /POSTGRES_POOL_MAX/)
  assert.match(config, /POSTGRES_POOL_IDLE_TIMEOUT_MS/)
  assert.match(config, /POSTGRES_POOL_CONNECTION_TIMEOUT_MS/)
  assert.match(defaults, /POSTGRES_POOL_MAX: '20'/)
  assert.match(defaults, /POSTGRES_POOL_IDLE_TIMEOUT_MS: '30000'/)
  assert.match(defaults, /POSTGRES_POOL_CONNECTION_TIMEOUT_MS: '10000'/)
})

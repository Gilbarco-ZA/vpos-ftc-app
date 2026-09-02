import assert from 'node:assert/strict'
import test from 'node:test'

import envDefaults from '../../src/platform/runtime/env-defaults.cjs'

const { ENV_DEFAULTS, applyEnvironmentDefaults } = envDefaults

test('runtime defaults populate missing application environment values', () => {
  const env: Record<string, string | undefined> = {}

  applyEnvironmentDefaults(env)

  assert.equal(env.PORT, '3080')
  assert.equal(env.POSTGRES_DATABASE, 'vpos_ftc')
  assert.equal(env.JPL_TCP_PORT, '8888')
  assert.equal(env.PSS_XML_SYNC_ENABLED, 'false')
  assert.equal(env.VPOS_APPLICATION_ROOT, '/opt/fccapps/vposftc')
  assert.equal(env.DEFAULT_ADMIN_PASSWORD, '')
})

test('runtime defaults preserve explicit deployment overrides', () => {
  const env: Record<string, string | undefined> = {
    PORT: '4100',
    POSTGRES_DATABASE: 'station_db',
    JPL_TCP_HOST: '10.10.20.30',
  }

  applyEnvironmentDefaults(env)

  assert.equal(env.PORT, '4100')
  assert.equal(env.POSTGRES_DATABASE, 'station_db')
  assert.equal(env.JPL_TCP_HOST, '10.10.20.30')
})

test('every built-in environment default is represented as a string', () => {
  assert.ok(Object.keys(ENV_DEFAULTS).length > 150)
  for (const [name, value] of Object.entries(ENV_DEFAULTS)) {
    assert.match(name, /^[A-Z][A-Z0-9_]*$/)
    assert.equal(typeof value, 'string', `${name} must have a string default`)
  }
})

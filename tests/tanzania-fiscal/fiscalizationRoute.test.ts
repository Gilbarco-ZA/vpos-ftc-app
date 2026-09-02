import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isLocalTanzaniaTransport,
  normalizeConfiguredFiscalizationTransport,
  normalizeFiscalizationTransport,
  resolveFiscalizationDefaults,
  resolveStationFiscalizationRoute,
} from '../../src/modules/tanzania-fiscal/infrastructure/route'

test('normalizes every configured transport to proxy', () => {
  assert.equal(normalizeFiscalizationTransport('proxy'), 'proxy')
  assert.equal(normalizeFiscalizationTransport('local_tz'), 'proxy')
  assert.equal(normalizeFiscalizationTransport('local-tanzania'), 'proxy')
  assert.equal(normalizeFiscalizationTransport('unexpected'), 'proxy')
  assert.equal(isLocalTanzaniaTransport('local_tz'), false)
})


test('preserves stored legacy transport only for cutover diagnostics', () => {
  assert.equal(normalizeConfiguredFiscalizationTransport('proxy'), 'proxy')
  assert.equal(
    normalizeConfiguredFiscalizationTransport('local_tz'),
    'local_tz',
  )
  assert.equal(
    normalizeConfiguredFiscalizationTransport('local-tanzania'),
    'local_tz',
  )
  assert.equal(
    normalizeConfiguredFiscalizationTransport('unexpected'),
    'proxy',
  )
})

test('routes Tanzania fiscalization through the proxy', () => {
  const route = resolveStationFiscalizationRoute({
    stationId: 'station-1',
    country: 'TZ',
    fiscalizationEngine: 'TZ',
    fiscalizationTransport: 'local_tz',
  })

  assert.equal(route.route, 'proxy')
  assert.equal(route.fiscalizationTransport, 'proxy')
  assert.equal(route.canUseLocalTanzania, false)
  assert.match(route.reason ?? '', /local TRA\/EWURA fiscalization is retired/i)
})

test('defaults Tanzania stations to the TZ engine over proxy transport', () => {
  const defaults = resolveFiscalizationDefaults({ country: 'Tanzania' })
  const route = resolveStationFiscalizationRoute({
    stationId: 'station-1',
    country: 'Tanzania',
  })

  assert.deepEqual(defaults, {
    fiscalizationEngine: 'TZ',
    fiscalizationTransport: 'proxy',
  })
  assert.equal(route.country, 'TZ')
  assert.equal(route.fiscalizationEngine, 'TZ')
  assert.equal(route.fiscalizationTransport, 'proxy')
  assert.equal(route.route, 'proxy')
})

test('upgrades legacy mock defaults for Tanzania while retaining proxy transport', () => {
  assert.deepEqual(
    resolveFiscalizationDefaults({
      country: 'TZ',
      fiscalizationEngine: 'mock',
      fiscalizationTransport: 'local_tz',
    }),
    {
      fiscalizationEngine: 'TZ',
      fiscalizationTransport: 'proxy',
    },
  )
})

test('preserves an explicit Tanzania engine using proxy transport', () => {
  assert.deepEqual(
    resolveFiscalizationDefaults({
      country: 'TZ',
      fiscalizationEngine: 'TZ',
      fiscalizationTransport: 'proxy',
    }),
    {
      fiscalizationEngine: 'TZ',
      fiscalizationTransport: 'proxy',
    },
  )
})

test('keeps proxy defaults for non-Tanzania stations', () => {
  assert.deepEqual(resolveFiscalizationDefaults({ country: 'KE' }), {
    fiscalizationEngine: 'mock',
    fiscalizationTransport: 'proxy',
  })

  const route = resolveStationFiscalizationRoute({
    stationId: 'station-1',
    country: 'Kenya',
  })
  assert.equal(route.country, 'KE')
  assert.equal(route.route, 'proxy')
})

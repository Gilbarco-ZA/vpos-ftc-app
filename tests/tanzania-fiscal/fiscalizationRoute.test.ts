import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeFiscalizationTransport,
  resolveStationFiscalizationRoute,
} from '../../src/modules/tanzania-fiscal/infrastructure/route'

test('normalizes fiscalization transport values', () => {
  assert.equal(normalizeFiscalizationTransport('proxy'), 'proxy')
  assert.equal(normalizeFiscalizationTransport('local_tz'), 'local_tz')
  assert.equal(normalizeFiscalizationTransport('local-tanzania'), 'local_tz')
  assert.equal(normalizeFiscalizationTransport('unexpected'), 'proxy')
})

test('allows local TZ only for Tanzania stations using TZ engine', () => {
  const route = resolveStationFiscalizationRoute({
    stationId: 'station-1',
    country: 'TZ',
    fiscalizationEngine: 'TZ',
    fiscalizationTransport: 'local_tz',
  })

  assert.equal(route.route, 'local_tz')
  assert.equal(route.canUseLocalTanzania, true)
  assert.equal(route.reason, undefined)
})

test('falls back to proxy when local TZ is requested for a non-Tanzania station', () => {
  const route = resolveStationFiscalizationRoute({
    stationId: 'station-1',
    country: 'ZA',
    fiscalizationEngine: 'TZ',
    fiscalizationTransport: 'local_tz',
  })

  assert.equal(route.route, 'proxy')
  assert.equal(route.canUseLocalTanzania, false)
  assert.match(route.reason ?? '', /only valid for Tanzania stations/i)
})

test('falls back to proxy when local TZ is requested without the TZ engine', () => {
  const route = resolveStationFiscalizationRoute({
    stationId: 'station-1',
    country: 'Tanzania',
    fiscalizationEngine: 'mock',
    fiscalizationTransport: 'local_tz',
  })

  assert.equal(route.route, 'proxy')
  assert.equal(route.canUseLocalTanzania, false)
  assert.match(route.reason ?? '', /requires fiscalization_engine TZ/i)
})

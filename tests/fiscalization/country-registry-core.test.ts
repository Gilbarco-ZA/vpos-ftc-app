import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CountryAdapterRegistry,
  getCountryDefinition,
  listCountryDefinitions,
  normalizeRegisteredCountry,
} from '@/src/modules/fiscalization/application/countryRegistry'

test('country registry recognizes country aliases', () => {
  assert.equal(normalizeRegisteredCountry('Kenya'), 'KE')
  assert.equal(normalizeRegisteredCountry('KEN'), 'KE')
  assert.equal(normalizeRegisteredCountry('United Republic of Tanzania'), 'TZ')
  assert.throws(() => normalizeRegisteredCountry('XX'), /Unsupported fiscalization country/)
  assert.throws(() => normalizeRegisteredCountry(null), /Unsupported fiscalization country/)
})

test('country definitions are available but no adapters connected', () => {
  assert.deepEqual(listCountryDefinitions().map((entry) => entry.countryCode), ['KE', 'TZ'])
  assert.equal(getCountryDefinition('KE').currency, 'KES')
  assert.equal(getCountryDefinition('TZ').currency, 'TZS')
  const registry = new CountryAdapterRegistry()
  assert.deepEqual(registry.available(), [])
  assert.throws(() => registry.resolve('KE'), /not connected/)
})

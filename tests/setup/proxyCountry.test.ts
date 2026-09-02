import test from 'node:test'
import assert from 'node:assert/strict'

import { extractProxyCountryCode } from '../../src/shared/proxy/client'

test('extracts country from a proxy registration response', () => {
  assert.equal(
    extractProxyCountryCode({
      apiKey: 'secret',
      countryId: 'tz',
      registrationStatus: { identity: { countryCode: 'KE' } },
    }),
    'TZ',
  )
})

test('extracts country from nested registration status identity', () => {
  assert.equal(
    extractProxyCountryCode({
      data: {
        registrationStatus: {
          identity: { countryId: 'cv' },
        },
      },
    }),
    'CV',
  )
})

test('extracts country from the registration status endpoint identity', () => {
  assert.equal(
    extractProxyCountryCode({ identity: { countryCode: 'ke' } }),
    'KE',
  )
})

test('returns null when no country is available', () => {
  assert.equal(extractProxyCountryCode({ isRegistered: true }), null)
  assert.equal(extractProxyCountryCode(null), null)
})

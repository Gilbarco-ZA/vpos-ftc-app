import test from 'node:test'
import assert from 'node:assert/strict'

import { enrichRegistrationStatus } from '../../src/modules/setup/application/enrichRegistrationStatus'

test('registration status fills site and device identity from local registration data', () => {
  const result = enrichRegistrationStatus(
    { isRegistered: false },
    {
      stationId: 'station-db-id',
      stationName: 'Airport Service Station',
      deviceData: {
        deviceId: 'device-local-01',
        deviceName: 'Till 1',
      },
      registrationData: {
        siteId: 'site-registration-id',
        registeredAt: '2026-07-15T06:00:00.000Z',
      },
    },
  )

  assert.equal(result.identity.siteId, 'site-registration-id')
  assert.equal(result.identity.siteName, 'Airport Service Station')
  assert.equal(result.deviceSettings.deviceId, 'device-local-01')
  assert.equal(result.deviceSettings.deviceName, 'Till 1')
  assert.equal(
    result.timestamps.statusUpdatedAt,
    '2026-07-15T06:00:00.000Z',
  )
})

test('registration status preserves current proxy identity before fallbacks', () => {
  const result = enrichRegistrationStatus(
    {
      identity: { siteId: 'proxy-site', siteName: 'Proxy Site Name' },
      deviceSettings: { deviceId: 'proxy-device' },
    },
    {
      stationId: 'station-db-id',
      stationName: 'Database Site Name',
      deviceData: { deviceId: 'cached-device' },
    },
  )

  assert.equal(result.identity.siteId, 'proxy-site')
  assert.equal(result.identity.siteName, 'Proxy Site Name')
  assert.equal(result.deviceSettings.deviceId, 'proxy-device')
})

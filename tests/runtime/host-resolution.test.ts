import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPreferredNetworkHost,
  resolveProductionHost,
} from '@/src/shared/forecourt/runtimeConfigShared'

test('getPreferredNetworkHost prefers the first external IPv4 address', () => {
  const host = getPreferredNetworkHost({
    lo: [
      {
        address: '127.0.0.1',
        family: 'IPv4',
        internal: true,
        netmask: '255.0.0.0',
        cidr: '127.0.0.1/8',
        mac: '00:00:00:00:00:00',
        scopeid: 0,
      },
    ],
    eth0: [
      {
        address: '10.24.8.19',
        family: 'IPv4',
        internal: false,
        netmask: '255.255.255.0',
        cidr: '10.24.8.19/24',
        mac: 'aa:bb:cc:dd:ee:ff',
        scopeid: 0,
      },
    ],
  } as unknown as Parameters<typeof getPreferredNetworkHost>[0])

  assert.equal(host, '10.24.8.19')
})

test('resolveProductionHost falls back from loopback in production', () => {
  assert.equal(
    resolveProductionHost('127.0.0.1', '10.24.8.19', true),
    '10.24.8.19',
  )
  assert.equal(
    resolveProductionHost('localhost', '10.24.8.19', true),
    '10.24.8.19',
  )
  assert.equal(
    resolveProductionHost('10.24.8.19', '10.24.8.20', true),
    '10.24.8.19',
  )
})
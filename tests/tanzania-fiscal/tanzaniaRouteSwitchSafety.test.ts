import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTanzaniaCloudCutoverChecklist,
  evaluateTanzaniaRouteSwitchSafety,
  type TanzaniaRouteSwitchSnapshot,
} from '../../src/modules/tanzania-fiscal/infrastructure/routeSwitchSafety'

const queue = (overrides: Partial<TanzaniaRouteSwitchSnapshot['queues']['localTransactions']> = {}) => ({
  pending: 0,
  processing: 0,
  failed: 0,
  ready: 0,
  totalOpen: 0,
  oldestOpenAt: null,
  lastError: null,
  ...overrides,
})

function snapshot(
  overrides: Partial<TanzaniaRouteSwitchSnapshot> = {},
): TanzaniaRouteSwitchSnapshot {
  return {
    stationId: 'station-1',
    country: 'TZ',
    fiscalizationEngine: 'TZ',
    currentTransport: 'local_tz',
    traRegistrationStatus: 'REGISTERED',
    ewuraRegistrationStatus: 'SENT',
    signingKeyConfigured: true,
    certSerialConfigured: true,
    traBaseUrlConfigured: true,
    traTokenCredentialsConfigured: true,
    ewuraBaseUrlConfigured: true,
    ewuraApiSourceConfigured: true,
    proxyUrlConfigured: true,
    eligibleProxyTransactions: 0,
    queues: {
      localTransactions: queue(),
      proxyTransactions: queue(),
      localReports: queue(),
      proxyReports: queue(),
      ewuraTransactions: queue(),
      ewuraReports: queue(),
      ewuraRegistration: queue(),
      traZReports: queue(),
    },
    ...overrides,
  }
}

test('blocks local-to-proxy route switches while local TRA/EWURA queues are open', () => {
  const result = evaluateTanzaniaRouteSwitchSafety({
    snapshot: snapshot({
      queues: {
        ...snapshot().queues,
        localTransactions: queue({ pending: 1, totalOpen: 1 }),
        ewuraReports: queue({ failed: 2, totalOpen: 2 }),
      },
    }),
    targetTransport: 'proxy',
    now: new Date('2026-07-08T10:00:00.000Z'),
  })

  assert.equal(result.direction, 'local_to_proxy')
  assert.equal(result.allowed, false)
  assert.deepEqual(
    result.blockers.map((issue) => issue.code),
    ['local-transaction-queue-open', 'ewura-report-queue-open'],
  )
  assert.ok(
    buildTanzaniaCloudCutoverChecklist(result).some((item) =>
      item.includes('Drain local TRA transaction queues'),
    ),
  )
})

test('blocks proxy-to-local route switches when local TRA config is incomplete', () => {
  const result = evaluateTanzaniaRouteSwitchSafety({
    snapshot: snapshot({
      currentTransport: 'proxy',
      signingKeyConfigured: false,
      traTokenCredentialsConfigured: false,
      traBaseUrlConfigured: false,
      eligibleProxyTransactions: 3,
    }),
    targetTransport: 'local_tz',
  })

  assert.equal(result.direction, 'proxy_to_local')
  assert.equal(result.allowed, false)
  assert.deepEqual(
    result.blockers.map((issue) => issue.code),
    [
      'eligible-proxy-transactions-open',
      'tra-base-url-missing',
      'tra-token-credentials-missing',
      'signing-key-missing',
    ],
  )
})

test('allows safe route switches while preserving warning-only evidence', () => {
  const result = evaluateTanzaniaRouteSwitchSafety({
    snapshot: snapshot({
      currentTransport: 'proxy',
      certSerialConfigured: false,
      ewuraRegistrationStatus: 'PENDING',
    }),
    targetTransport: 'local_tz',
  })

  assert.equal(result.allowed, true)
  assert.equal(result.requiresConfirmation, true)
  assert.deepEqual(
    result.warnings.map((issue) => issue.code),
    ['cert-serial-missing', 'ewura-registration-not-confirmed'],
  )
  assert.equal(
    result.checklist.find((item) => item.code === 'tra-live-config')?.status,
    'pass',
  )
})

test('blocks local Tanzania target for non-Tanzania stations', () => {
  const result = evaluateTanzaniaRouteSwitchSafety({
    snapshot: snapshot({ country: 'ZA', currentTransport: 'proxy' }),
    targetTransport: 'local_tz',
  })

  assert.equal(result.allowed, false)
  assert.equal(result.blockers[0]?.code, 'target-route-not-local-tanzania')
})

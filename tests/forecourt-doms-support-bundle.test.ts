import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDomsObservabilitySummary,
  buildDomsSupportBundleFilename,
  redactSupportValue,
} from '../src/modules/forecourt/application/domsSupportBundle'

test('redacts secret-bearing support bundle fields recursively', () => {
  const redacted = redactSupportValue({
    safe: 'visible',
    nested: {
      password: 'secret',
      certSerial: 'should-redact',
      headers: { Authorization: 'Bearer token' },
      payload: [{ apiKey: 'key' }, { value: 'kept' }],
    },
  }) as any

  assert.equal(redacted.safe, 'visible')
  assert.equal(redacted.nested.password, '[REDACTED]')
  assert.equal(redacted.nested.certSerial, '[REDACTED]')
  assert.equal(redacted.nested.headers.Authorization, '[REDACTED]')
  assert.equal(redacted.nested.payload[0].apiKey, '[REDACTED]')
  assert.equal(redacted.nested.payload[1].value, 'kept')
})

test('builds support observability counters and command latency summaries', () => {
  const now = Date.now()
  const summary = buildDomsObservabilitySummary({
    diagnostics: {
      adapterState: {
        reconnectAttempts: 4,
        lastMessageAt: now - 5000,
        lastHeartbeatAt: now - 8000,
        lastRequestAt: now - 2000,
        lastServiceMessages: [{ seqNo: '1' }],
        lastBackOfficeRecords: [{ seqNo: '2' }],
      },
      bufferHealth: {
        supervised: {
          '1': {
            depth: 1,
            lastReadAt: now - 31 * 60_000,
            lastClearAt: 0,
          },
        },
        unsupervised: {},
      },
    },
    eventCounts: [
      { event_type: 'RejectMessage_resp', cnt: 2 },
      { event_type: 'heartbeat_timeout', cnt: 1 },
      { event_type: 'transaction_read_failed', cnt: 1 },
      { event_type: 'transaction_clear_failed', cnt: 1 },
    ],
    recentRejects: [{ id: 'r1' }],
    recentCommands: [
      {
        command: 'authorize_Fp_req',
        requested_at: '2026-07-08T10:00:00.000Z',
        result_received_at: '2026-07-08T10:00:01.250Z',
      },
      {
        command: 'authorize_Fp_req',
        requested_at: '2026-07-08T10:00:02.000Z',
        result_received_at: '2026-07-08T10:00:03.000Z',
      },
    ],
  })

  assert.equal(summary.status, 'critical')
  assert.equal(summary.metrics.find((m) => m.name === 'reconnects')?.value, 4)
  assert.equal(summary.metrics.find((m) => m.name === 'rejects')?.value, 2)
  assert.equal(
    summary.metrics.find((m) => m.name === 'missedHeartbeatTimeouts')?.value,
    1,
  )
  assert.equal(
    summary.metrics.find((m) => m.name === 'transactionReadFailures')?.value,
    1,
  )
  assert.equal(
    summary.metrics.find((m) => m.name === 'transactionClearFailures')?.value,
    1,
  )
  assert.equal(summary.metrics.find((m) => m.name === 'staleLocks')?.value, 1)
  assert.deepEqual(summary.latency.byCommand, [
    {
      command: 'authorize_Fp_req',
      count: 2,
      minMs: 1000,
      avgMs: 1125,
      maxMs: 1250,
    },
  ])
})

test('builds filesystem-safe support bundle filenames', () => {
  assert.equal(
    buildDomsSupportBundleFilename(
      ' Station / A:01 ',
      '2026-07-08T11:22:33.444Z',
    ),
    'doms-support-Station-A01-20260708T112233444Z.json',
  )
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  calculateJplReconnectDelay,
  evaluateJplConnectionLiveness,
  resolveJplConnectionPolicy,
} from '../../src/modules/forecourt/infrastructure/jpl/sessionPolicy'

describe('DOMS/JPL session policy', () => {
  it('uses protocol-safe heartbeat and dead-connection defaults', () => {
    assert.deepEqual(resolveJplConnectionPolicy({}), {
      heartbeatIntervalMs: 15_000,
      deadConnectionTimeoutMs: 30_000,
      monitorIntervalMs: 5_000,
    })
  })

  it('enforces minimum and dependent timeouts', () => {
    assert.deepEqual(
      resolveJplConnectionPolicy({
        heartbeatIntervalMs: 1_000,
        deadConnectionTimeoutMs: 2_000,
      }),
      {
        heartbeatIntervalMs: 5_000,
        deadConnectionTimeoutMs: 10_000,
        monitorIntervalMs: 2_500,
      },
    )
  })

  it('caps exponential reconnect backoff', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 20].map((attempt) =>
        calculateJplReconnectDelay({
          attempt,
          baseDelayMs: 1_000,
          maxDelayMs: 30_000,
        }),
      ),
      [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000],
    )
  })

  it('classifies unknown, healthy, and dead connections deterministically', () => {
    assert.equal(
      evaluateJplConnectionLiveness({
        now: 20_000,
        lastMessageAt: null,
        lastConnectAt: null,
        deadConnectionTimeoutMs: 30_000,
      }).status,
      'unknown',
    )
    assert.equal(
      evaluateJplConnectionLiveness({
        now: 20_000,
        lastMessageAt: 10_000,
        lastConnectAt: 5_000,
        deadConnectionTimeoutMs: 30_000,
      }).status,
      'healthy',
    )
    assert.equal(
      evaluateJplConnectionLiveness({
        now: 45_001,
        lastMessageAt: 10_000,
        lastConnectAt: 5_000,
        deadConnectionTimeoutMs: 30_000,
      }).status,
      'dead',
    )
  })
})

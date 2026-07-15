import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyEwuraFailure,
  computeEwuraRetryDelaySeconds,
  getEwuraPartialFiscalizationPolicy,
} from '../../src/modules/tanzania-fiscal/infrastructure/ewuraRetry'

test('computes bounded EWURA exponential retry delays', () => {
  assert.equal(
    computeEwuraRetryDelaySeconds({
      retryCount: 0,
      baseDelaySeconds: 60,
      maxDelaySeconds: 3600,
    }),
    60,
  )
  assert.equal(
    computeEwuraRetryDelaySeconds({
      retryCount: 3,
      baseDelaySeconds: 60,
      maxDelaySeconds: 3600,
    }),
    480,
  )
  assert.equal(
    computeEwuraRetryDelaySeconds({
      retryCount: 20,
      baseDelaySeconds: 60,
      maxDelaySeconds: 3600,
    }),
    3600,
  )
})

test('classifies EWURA endpoint/network failures as retryable until attempts are exhausted', () => {
  const now = new Date('2026-07-08T08:00:00.000Z')
  const decision = classifyEwuraFailure({
    error: 'fetch failed',
    responsePayload: { httpStatus: 503, message: 'Service unavailable' },
    retryCount: 1,
    maxAttempts: 5,
    baseDelaySeconds: 60,
    maxDelaySeconds: 3600,
    now,
  })

  assert.equal(decision.retryable, true)
  assert.equal(decision.terminal, false)
  assert.equal(decision.attemptsUsed, 2)
  assert.equal(decision.attemptsRemaining, 3)
  assert.equal(
    decision.nextAttemptAt?.toISOString(),
    '2026-07-08T08:02:00.000Z',
  )
})

test('classifies EWURA config and client validation failures as terminal', () => {
  const byConfig = classifyEwuraFailure({
    error: 'EWURA base URL is not configured in DB.',
    retryCount: 0,
    maxAttempts: 5,
    baseDelaySeconds: 60,
    maxDelaySeconds: 3600,
  })
  assert.equal(byConfig.retryable, false)
  assert.equal(byConfig.terminal, true)

  const byHttp = classifyEwuraFailure({
    error: 'bad request',
    responsePayload: { httpStatus: 400, message: 'Invalid payload' },
    retryCount: 0,
    maxAttempts: 5,
    baseDelaySeconds: 60,
    maxDelaySeconds: 3600,
  })
  assert.equal(byHttp.retryable, false)
  assert.equal(byHttp.terminal, true)
})

test('makes EWURA partial fiscalization policy explicit and configurable', () => {
  assert.deepEqual(
    getEwuraPartialFiscalizationPolicy({
      failureMode: 'async_retry',
      ewuraOk: false,
    }),
    {
      failureMode: 'async_retry',
      blockTransaction: false,
      responseStatus: 'SUCCESS',
      fiscalizationState: 'TRA_CONFIRMED_EWURA_PENDING',
      auditMessage:
        'TRA fiscalization completed; EWURA failed and remains queued for asynchronous retry.',
    },
  )

  assert.equal(
    getEwuraPartialFiscalizationPolicy({
      failureMode: 'block_transaction',
      ewuraOk: false,
    }).blockTransaction,
    true,
  )

  assert.equal(
    getEwuraPartialFiscalizationPolicy({
      failureMode: 'async_retry',
      ewuraOk: true,
    }).fiscalizationState,
    'TRA_AND_EWURA_CONFIRMED',
  )
})

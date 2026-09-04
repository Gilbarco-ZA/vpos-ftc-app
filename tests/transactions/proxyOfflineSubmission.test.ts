import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isOfflineProxySubmission } from '@/src/modules/transactions/infrastructure/fiscalization/proxyOfflineSubmission'

describe('offline proxy fiscalization detection', () => {
  it('detects OFFLINE_SUCCESS responses', () => {
    assert.equal(
      isOfflineProxySubmission({
        responseCode: 'OFFLINE_SUCCESS',
        status: 'ACCEPTED',
      }),
      true,
    )
  })

  it('detects nested offline submissions persisted by the proxy sender', () => {
    assert.equal(
      isOfflineProxySubmission({
        submission: {
          details: {
            isOnline: false,
            isFiscalized: false,
          },
        },
        final: null,
      }),
      true,
    )
  })

  it('does not classify ordinary asynchronous online submissions as offline', () => {
    assert.equal(
      isOfflineProxySubmission({
        status: 'ACCEPTED',
        details: {
          isOnline: true,
          isFiscalized: false,
        },
      }),
      false,
    )
  })

  it('does not classify a final online fiscalized response as offline', () => {
    assert.equal(
      isOfflineProxySubmission({
        responseCode: '200',
        status: 'SUCCESS',
        details: {
          isOnline: true,
          isFiscalized: true,
        },
      }),
      false,
    )
  })

  it('prefers a later final online result over an earlier offline submission', () => {
    assert.equal(
      isOfflineProxySubmission({
        submission: {
          responseCode: 'OFFLINE_SUCCESS',
          details: { isOnline: false, isFiscalized: false },
        },
        final: {
          responseCode: '200',
          status: 'SUCCESS',
          details: { isOnline: true, isFiscalized: true },
        },
      }),
      false,
    )
  })

  it('treats a reconciled final success as online even without explicit flags', () => {
    assert.equal(
      isOfflineProxySubmission({
        submission: {
          responseCode: 'OFFLINE_SUCCESS',
          status: 'OFFLINE_QUEUED',
        },
        final: {
          responseCode: '200',
          status: 'SUCCESS',
        },
      }),
      false,
    )
  })
})

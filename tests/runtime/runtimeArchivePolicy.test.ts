import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCompactRuntimeArchivePayload,
  getRuntimeArchivePolicy,
  isRuntimeArchiveMessageAllowed,
} from '@/src/modules/archive/domain/runtimeArchivePolicy'

test('runtime archive is disabled by default and retention remains bounded', () => {
  const policy = getRuntimeArchivePolicy({})

  assert.equal(policy.mode, 'off')
  assert.deepEqual(policy.allowlist, [])
  assert.equal(policy.retentionDays, 30)
  assert.equal(policy.cleanupBatchSize, 1000)
  assert.equal(policy.cleanupMaxBatches, 10)
})

test('runtime archive requires compact allowlist mode and an explicit match', () => {
  const policy = getRuntimeArchivePolicy({
    VPOS_RUNTIME_ARCHIVE_MODE: 'compact-allowlist',
    VPOS_RUNTIME_ARCHIVE_ALLOWLIST:
      'pos:fiscalAuthResponse, forecourt:*, *:criticalAlarm',
  })

  assert.equal(
    isRuntimeArchiveMessageAllowed(policy, 'pos', 'fiscalAuthResponse'),
    true,
  )
  assert.equal(
    isRuntimeArchiveMessageAllowed(policy, 'forecourt', 'transactionUpdate'),
    true,
  )
  assert.equal(
    isRuntimeArchiveMessageAllowed(policy, 'tank', 'criticalAlarm'),
    true,
  )
  assert.equal(
    isRuntimeArchiveMessageAllowed(policy, 'pos', 'receiptGenerated'),
    false,
  )
})

test('invalid archive modes fail closed', () => {
  const policy = getRuntimeArchivePolicy({
    VPOS_RUNTIME_ARCHIVE_MODE: 'enabled',
    VPOS_RUNTIME_ARCHIVE_ALLOWLIST: '*',
  })

  assert.equal(policy.mode, 'off')
  assert.equal(isRuntimeArchiveMessageAllowed(policy, 'pos', 'message'), false)
})

test('compact archive payload retains identifiers and outcome but drops full data', () => {
  const compact = buildCompactRuntimeArchivePayload(
    {
      type: 'fiscalAuthResponse',
      requestId: 'req-123',
      transactionId: 'tx-456',
      ok: false,
      status: 'FAILED',
      at: 1_700_000_000_000,
      token: 'must-not-be-stored',
      receipt: '<full receipt body>',
      payload: {
        fpId: 4,
        fiscalResponse: { huge: 'duplicate response' },
        password: 'secret',
      },
      error: {
        name: 'FiscalError',
        code: 'FISCAL_TIMEOUT',
        message: 'Fiscal request timed out',
        stack: 'must-not-be-stored',
        rawResponse: 'must-not-be-stored',
      },
    },
    'pos',
    'fiscalAuthResponse',
  )

  assert.deepEqual(compact, {
    schemaVersion: 1,
    topic: 'pos',
    messageType: 'fiscalAuthResponse',
    emittedAt: '2023-11-14T22:13:20.000Z',
    identifiers: {
      requestId: 'req-123',
      transactionId: 'tx-456',
      fpId: 4,
    },
    outcome: {
      status: 'FAILED',
      ok: false,
    },
    error: {
      name: 'FiscalError',
      code: 'FISCAL_TIMEOUT',
      message: 'Fiscal request timed out',
    },
  })

  const serialized = JSON.stringify(compact)
  assert.doesNotMatch(serialized, /must-not-be-stored/)
  assert.doesNotMatch(serialized, /receipt body/)
  assert.doesNotMatch(serialized, /duplicate response/)
  assert.doesNotMatch(serialized, /password/)
})

test('sensitive error messages are redacted from compact archive rows', () => {
  const compact = buildCompactRuntimeArchivePayload(
    {
      error: {
        code: 'REMOTE_FAILURE',
        message: 'Authorization: Bearer highly-sensitive-token',
      },
    },
    'fiscal',
    'requestFailed',
  )

  assert.deepEqual(compact.error, {
    code: 'REMOTE_FAILURE',
    message: '[redacted sensitive error message]',
  })
})

test('runtime archive retention settings are clamped to safe bounds', () => {
  const policy = getRuntimeArchivePolicy({
    VPOS_RUNTIME_ARCHIVE_RETENTION_DAYS: '-5',
    VPOS_RUNTIME_ARCHIVE_CLEANUP_INTERVAL_MS: '100',
    VPOS_RUNTIME_ARCHIVE_CLEANUP_BATCH_SIZE: '999999',
    VPOS_RUNTIME_ARCHIVE_CLEANUP_MAX_BATCHES: '0',
  })

  assert.equal(policy.retentionDays, 0)
  assert.equal(policy.cleanupIntervalMs, 60_000)
  assert.equal(policy.cleanupBatchSize, 10_000)
  assert.equal(policy.cleanupMaxBatches, 1)

  const blankValues = getRuntimeArchivePolicy({
    VPOS_RUNTIME_ARCHIVE_RETENTION_DAYS: ' ',
    VPOS_RUNTIME_ARCHIVE_CLEANUP_BATCH_SIZE: '',
  })
  assert.equal(blankValues.retentionDays, 30)
  assert.equal(blankValues.cleanupBatchSize, 1000)
})

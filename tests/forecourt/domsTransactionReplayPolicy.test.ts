import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildTransactionBufferEventType,
  buildTransactionCaptureKey,
  buildTransactionPumpLockKey,
  buildTransactionReplayKey,
  classifyTransactionLockOwnership,
  describeIdZeroRecoveryPolicy,
  JPL_TRANSACTION_BUFFER_SUBCODES,
  normalizeTransactionBufferSubCode,
  resolveTransactionReplayAction,
} from '../../src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'

describe('DOMS transaction replay identity and buffer status policy', () => {
  it('keeps replay identities isolated by station, mode, pump, and sequence', () => {
    assert.equal(
      buildTransactionReplayKey({
        stationId: 'station-a',
        sourceMode: 'supervised',
        fpId: 1,
        transSeqNo: 7,
      }),
      'station-a:supervised:01:0007',
    )
    assert.notEqual(
      buildTransactionReplayKey({
        stationId: 'station-a',
        sourceMode: 'supervised',
        fpId: 1,
        transSeqNo: 7,
      }),
      buildTransactionReplayKey({
        stationId: 'station-b',
        sourceMode: 'supervised',
        fpId: 1,
        transSeqNo: 7,
      }),
    )
    assert.equal(
      buildTransactionCaptureKey({
        stationId: 'station-a',
        sourceMode: 'unsupervised',
        fpId: 2,
        transSeqNo: 18,
      }),
      'capture:station-a:unsupervised:02:0018',
    )
    assert.equal(
      buildTransactionPumpLockKey({
        stationId: 'station-a',
        sourceMode: 'supervised',
        fpId: 9,
      }),
      'station-a:supervised:09',
    )
  })

  it('preserves each protocol-defined buffer status subcode', () => {
    assert.deepEqual(JPL_TRANSACTION_BUFFER_SUBCODES, ['03H', '01H', '00H'])
    for (const subCode of JPL_TRANSACTION_BUFFER_SUBCODES) {
      assert.equal(normalizeTransactionBufferSubCode(subCode), subCode)
      assert.equal(
        buildTransactionBufferEventType('FpSupTransBufStatus_resp', subCode),
        `FpSupTransBufStatus_resp_${subCode}`,
      )
      assert.equal(
        buildTransactionBufferEventType('FpUnSupTransBufStatus_resp', subCode),
        `FpUnSupTransBufStatus_resp_${subCode}`,
      )
    }
    assert.equal(normalizeTransactionBufferSubCode('02H'), null)
  })

  it('classifies unlocked, locally owned, and foreign transaction locks', () => {
    assert.equal(
      classifyTransactionLockOwnership({ lockId: null, currentPosId: '01' }),
      'unlocked',
    )
    assert.equal(
      classifyTransactionLockOwnership({ lockId: '00', currentPosId: '01' }),
      'unlocked',
    )
    assert.equal(
      classifyTransactionLockOwnership({ lockId: '1', currentPosId: '01' }),
      'owned',
    )
    assert.equal(
      classifyTransactionLockOwnership({ lockId: '02', currentPosId: '01' }),
      'foreign',
    )
  })

  it('selects safe replay actions for empty, owned, and foreign locks', () => {
    assert.equal(
      resolveTransactionReplayAction({
        lockId: '00',
        currentPosId: '01',
        hasDurableClearPayload: false,
      }),
      'read',
    )
    assert.equal(
      resolveTransactionReplayAction({
        lockId: '01',
        currentPosId: '01',
        hasDurableClearPayload: true,
      }),
      'resume_clear',
    )
    assert.equal(
      resolveTransactionReplayAction({
        lockId: '01',
        currentPosId: '01',
        hasDurableClearPayload: false,
      }),
      'unlock_then_read',
    )
    assert.equal(
      resolveTransactionReplayAction({
        lockId: '02',
        currentPosId: '01',
        hasDurableClearPayload: true,
      }),
      'block_foreign',
    )
  })

  it('keeps ID_ZERO release outside automatic recovery', () => {
    assert.deepEqual(describeIdZeroRecoveryPolicy(), {
      automaticRelease: false,
      requiredPosId: '00',
      policy:
        'ID_ZERO unlock is restricted to an explicit operator/field recovery procedure after the transaction has been durably captured or independently verified. Normal replay and automatic startup recovery never release a foreign POS lock.',
    })
  })
})

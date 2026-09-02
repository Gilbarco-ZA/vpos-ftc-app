import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildTransactionBufferEventType,
  buildTransactionCaptureKey,
  buildTransactionPumpLockKey,
  buildTransactionReplayKey,
  classifyTransactionLockOwnership,
  describeIdZeroRecoveryPolicy,
  isTransactionReplayMappingReady,
  JPL_TRANSACTION_BUFFER_SUBCODES,
  normalizeTransactionBufferSubCode,
  resolveReplayNozzleMapping,
  resolveTransactionReplayAction,
  shouldSuppressRecentlyClearedOwnedReplay,
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

  it('suppresses only a recent stale snapshot that still carries this POS lock after a verified clear', () => {
    const clearedAt = '2026-08-24T11:11:16.500Z'
    const nowMs = Date.parse('2026-08-24T11:11:22.100Z')

    assert.equal(
      shouldSuppressRecentlyClearedOwnedReplay({
        lockId: '01',
        currentPosId: '01',
        replayStage: 'cleared',
        clearedAt,
        nowMs,
      }),
      true,
    )
    assert.equal(
      shouldSuppressRecentlyClearedOwnedReplay({
        lockId: '00',
        currentPosId: '01',
        replayStage: 'cleared',
        clearedAt,
        nowMs,
      }),
      false,
    )
    assert.equal(
      shouldSuppressRecentlyClearedOwnedReplay({
        lockId: '01',
        currentPosId: '01',
        replayStage: 'cleared',
        clearedAt,
        nowMs: nowMs + 31_000,
      }),
      false,
    )
    assert.equal(
      shouldSuppressRecentlyClearedOwnedReplay({
        lockId: '01',
        currentPosId: '01',
        replayStage: 'captured',
        clearedAt,
        nowMs,
      }),
      false,
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

  it('defers transaction replay until every configured nozzle resolves a product', () => {
    assert.equal(isTransactionReplayMappingReady(null), false)
    assert.equal(
      isTransactionReplayMappingReady({
        nozzles: [
          {
            nozzleId: 'nozzle-1',
            nozzleNumber: null,
            productCode: 'D50',
          },
        ],
      }),
      false,
    )
    assert.equal(
      isTransactionReplayMappingReady({
        nozzles: [
          {
            nozzleId: 'nozzle-1',
            nozzleNumber: 1,
            productCode: null,
          },
        ],
      }),
      false,
    )
    assert.equal(
      isTransactionReplayMappingReady({
        nozzles: [
          {
            nozzleId: 'nozzle-1',
            nozzleNumber: 1,
            productCode: 'D50',
          },
          {
            nozzleId: 'nozzle-2',
            nozzleNumber: 2,
            productCode: 'ULP95',
          },
        ],
      }),
      true,
    )
  })

  it('does not guess a nozzle on a multi-nozzle pump', () => {
    const mapping = {
      nozzles: [
        {
          nozzleId: 'nozzle-1',
          nozzleNumber: 1,
          productCode: 'D50',
          domsGradeId: '10',
        },
        {
          nozzleId: 'nozzle-2',
          nozzleNumber: 2,
          productCode: 'ULP95',
          domsGradeOptionId: 20,
        },
      ],
    }

    assert.equal(
      resolveReplayNozzleMapping({ mapping, nozzleNumber: 2 })?.nozzleId,
      'nozzle-2',
    )
    assert.equal(
      resolveReplayNozzleMapping({ mapping, gradeId: '10' })?.nozzleId,
      'nozzle-1',
    )
    assert.equal(
      resolveReplayNozzleMapping({ mapping, gradeOptionId: '20' })?.nozzleId,
      'nozzle-2',
    )
    assert.equal(resolveReplayNozzleMapping({ mapping }), null)
  })

  it('requires grade option evidence when the same grade is on multiple nozzles', () => {
    const mapping = {
      nozzles: [
        {
          nozzleId: 'nozzle-2',
          nozzleNumber: 2,
          productCode: 'ULP95',
          domsGradeId: '2',
          domsGradeOptionId: 2,
        },
        {
          nozzleId: 'nozzle-3',
          nozzleNumber: 3,
          productCode: 'ULP95',
          domsGradeId: '2',
          domsGradeOptionId: 3,
        },
      ],
    }

    assert.equal(resolveReplayNozzleMapping({ mapping, gradeId: '2' }), null)
    assert.equal(
      resolveReplayNozzleMapping({ mapping, gradeId: '2', gradeOptionId: '3' })
        ?.nozzleId,
      'nozzle-3',
    )
  })

})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  normalizeJplWashStatusBuffer,
  normalizeJplWashTransaction,
} from '../../src/modules/forecourt/infrastructure/jpl/washTransactions'

describe('DOMS/JPL wash transaction capture', () => {
  it('extracts pending unsupervised wash buffer entries from WpStatus', () => {
    const entries = normalizeJplWashStatusBuffer({
      WpId: '3',
      WpTransInUnsBuffer: [
        {
          WpTransSeqNo: '7',
          WpSmId: '2',
          TransLockId: '1',
          Money: '000500',
          WpTransInfoMask: { value: 2, bits: { ErrorTrans: 2 } },
        },
      ],
    })

    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.wpId, '03')
    assert.equal(entries[0]?.transSeqNo, '0007')
    assert.equal(entries[0]?.smId, '02')
    assert.equal(entries[0]?.transLockId, '01')
    assert.equal(entries[0]?.hasError, true)
    assert.ok(entries[0]?.sourceHash)
  })

  it('normalizes WpUnSupTrans into a clear candidate', () => {
    const normalized = normalizeJplWashTransaction({
      WpId: '3',
      PosId: '1',
      WpTransPars: {
        WpTransSeqNo: '7',
        FcWashId: '5',
        WashProgramNo: '2',
        Money: '000500',
        StartDate: '20260709',
        StartTime: '101530',
        WpTransTerminationStatus: { value: 0, bits: {} },
      },
    })

    assert.equal(normalized.wpId, '03')
    assert.equal(normalized.transSeqNo, '0007')
    assert.equal(normalized.posId, '01')
    assert.equal(normalized.money, '000500')
    assert.equal(normalized.fcWashId, '05')
    assert.equal(normalized.washProgramNo, '02')
    assert.equal(normalized.reviewStatus, 'pending_clear')
    assert.equal(normalized.clearStatus, 'pending_clear')
    assert.deepEqual(normalized.clearRequest, {
      name: 'clear_WpUnSupTrans_req',
      subCode: '00H',
      data: {
        WpId: '03',
        PosId: '01',
        TransSeqNo: '0007',
        Money: '000500',
      },
    })
  })

  it('blocks incomplete wash transactions and flags zero-money rows for review', () => {
    const incomplete = normalizeJplWashTransaction({ WpId: '3' })
    assert.equal(incomplete.reviewStatus, 'needs_review')
    assert.equal(incomplete.clearStatus, 'blocked')
    assert.equal(incomplete.clearRequest, null)

    const zero = normalizeJplWashTransaction({
      WpId: '3',
      PosId: '1',
      TransSeqNo: '7',
      Money: '000000',
    })
    assert.equal(zero.reviewStatus, 'zero_transaction_review')
    assert.equal(zero.clearStatus, 'pending_clear')
    assert.ok(zero.clearRequest)
  })
})

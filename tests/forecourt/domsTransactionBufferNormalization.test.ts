import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeForecourtEvent } from '../../src/modules/forecourt/infrastructure/normalize'

describe('DOMS transaction buffer normalization', () => {
  it('normalizes the legacy 00H supervised buffer shape', () => {
    const result = normalizeForecourtEvent('FpSupTransBufStatus_resp_00H', {
      FpId: '01',
      TransInSupBuffer: [
        {
          TransSeqNo: '0007',
          SmId: '11',
          TransLockId: '02',
          TransInfoMask: { value: 223 },
          MoneyDue: '001234',
          Vol: '000567',
        },
      ],
    })

    assert.deepEqual(result.transactions, [
      {
        fpId: 1,
        isSupported: true,
        transSeqNo: 7,
        smId: 11,
        transLockId: 2,
        transInfoMask: 223,
        fcGradeId: null,
        fpGradeOptionNo: null,
        finishDate: null,
        finishTime: null,
        moneyDue: 1234,
        volume: 567,
        sourceMode: 'supervised',
        isSupervised: true,
        raw: {
          TransSeqNo: '0007',
          SmId: '11',
          TransLockId: '02',
          TransInfoMask: { value: 223 },
          MoneyDue: '001234',
          Vol: '000567',
        },
      },
    ])
  })

  it('normalizes the 01H grade-aware unsupervised buffer shape', () => {
    const result = normalizeForecourtEvent('FpUnSupTransBufStatus_resp_01H', {
      FpId: '02',
      TransInUnSupBuffer: [
        {
          TransSeqNo: '0018',
          SmId: '21',
          TransLockId: '00',
          TransInfoMask: { value: 159 },
          MoneyDue: '000999',
          Vol: '000111',
          FcGradeId: '04',
        },
      ],
    })

    assert.equal(result.transactions?.[0]?.fpId, 2)
    assert.equal(result.transactions?.[0]?.sourceMode, 'unsupervised')
    assert.equal(result.transactions?.[0]?.isSupervised, false)
    assert.equal(result.transactions?.[0]?.fcGradeId, 4)
    assert.equal(result.transactions?.[0]?.transLockId, 0)
  })

  it('normalizes 03H extended values and TransInfoFlags without truncating fields', () => {
    const result = normalizeForecourtEvent('FpSupTransBufStatus_resp_03H', {
      FpId: '03',
      TransInSupBuffer: [
        {
          TransSeqNo: '0123',
          SmId: '11',
          TransLockId: '01',
          TransInfoFlags: { value: 79 },
          MoneyDue_e: '1234567890',
          Vol_e: '0987654321',
          FcGradeId: '07',
        },
      ],
    })

    assert.equal(result.transactions?.[0]?.transInfoMask, 79)
    assert.equal(result.transactions?.[0]?.moneyDue, 1234567890)
    assert.equal(result.transactions?.[0]?.volume, 987654321)
    assert.equal(result.transactions?.[0]?.fcGradeId, 7)
  })

  it('returns an empty transaction list for an empty buffer status', () => {
    const result = normalizeForecourtEvent('FpSupTransBufStatus_resp_03H', {
      FpId: '04',
      TransInSupBuffer: [],
    })

    assert.deepEqual(result.transactions, [])
  })

  it('normalizes supervised transaction parameters nested under TransPars', () => {
    const result = normalizeForecourtEvent('FpSupTrans_resp_00H', {
      FpId: '01',
      TransSeqNo: '0001',
      TransPars: {
        FcGradeId: '04',
        FpGradeOptionNo: '01',
        Price_e: '020690',
        Vol_e: '0000002600',
        Money_e: '0000537940',
        FinishDate: '20260811',
        FinishTime: '100459',
      },
    })

    assert.equal(result.transactions?.[0]?.fcGradeId, 4)
    assert.equal(result.transactions?.[0]?.fpGradeOptionNo, 1)
    assert.equal(result.transactions?.[0]?.finishDate, '20260811')
    assert.equal(result.transactions?.[0]?.finishTime, '100459')
    assert.equal(result.transactions?.[0]?.volume, 2600)
    assert.equal(result.transactions?.[0]?.moneyDue, 537940)
  })

})

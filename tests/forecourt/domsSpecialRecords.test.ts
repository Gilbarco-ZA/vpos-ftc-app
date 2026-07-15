import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isEmptyDomsBackOfficeRecord,
  normalizeDomsBackOfficeRecord,
  normalizeDomsServiceMessageRecord,
} from '../../src/modules/forecourt/infrastructure/jpl/specialRecords'

describe('DOMS/JPL special record normalization', () => {
  it('normalizes service messages into stable persisted records', () => {
    const first = normalizeDomsServiceMessageRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      seqNo: '07',
      message: '19990911 235959 04 02   ',
      payload: { FcServiceMsgSeqNo: '07', FcServiceMsg: '19990911 235959 04 02' },
    })
    const second = normalizeDomsServiceMessageRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      seqNo: '07',
      message: '19990911 235959 04 02',
      payload: { FcServiceMsg: '19990911 235959 04 02', FcServiceMsgSeqNo: '07' },
    })

    assert.equal(first.seqNo, '07')
    assert.equal(first.message, '19990911 235959 04 02')
    assert.equal(first.sourceHash, second.sourceHash)
  })

  it('detects empty back office records per supported subcode', () => {
    const emptySubc00 = normalizeDomsBackOfficeRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      subCode: '00H',
      payload: { BorSeqNo: '12', BorLen: 0 },
    })
    const emptySubc01 = normalizeDomsBackOfficeRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      subCode: '01H',
      payload: { BorSeqNo: '12', BorLength: 0 },
    })
    const emptySubc02 = normalizeDomsBackOfficeRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      subCode: '02H',
      payload: { BorSeqNo: '12', BorData: '' },
    })

    assert.equal(isEmptyDomsBackOfficeRecord(emptySubc00), true)
    assert.equal(isEmptyDomsBackOfficeRecord(emptySubc01), true)
    assert.equal(isEmptyDomsBackOfficeRecord(emptySubc02), true)
  })

  it('normalizes non-empty back office records with stable hashes', () => {
    const first = normalizeDomsBackOfficeRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      subCode: '02H',
      payload: {
        BorSeqNo: '12',
        BorFormatId: { value: '51' },
        BorData: '<record />',
      },
    })
    const second = normalizeDomsBackOfficeRecord({
      stationId: '00000000-0000-0000-0000-000000000001',
      subCode: '02H',
      payload: {
        BorData: '<record />',
        BorFormatId: { value: '51' },
        BorSeqNo: '12',
      },
    })

    assert.equal(first.seqNo, '12')
    assert.equal(first.formatId, '51')
    assert.equal(first.borData, '<record />')
    assert.equal(isEmptyDomsBackOfficeRecord(first), false)
    assert.equal(first.sourceHash, second.sourceHash)
  })
})

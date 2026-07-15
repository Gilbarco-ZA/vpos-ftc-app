import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  classifyDomsBackOfficeRecord,
  classifyDomsServiceMessage,
} from '../../src/modules/forecourt/infrastructure/jpl/specialRecordProcessing'

describe('DOMS/JPL special record processing', () => {
  it('classifies legacy service-log connection records for operator review', () => {
    const classification = classifyDomsServiceMessage({
      seqNo: '12',
      message: '19990911 235959 04 02',
      payloadJson: { FcServiceMsgSeqNo: '12' },
    })

    assert.equal(classification.serviceCode, '04')
    assert.equal(classification.routeKey, 'pos_connection')
    assert.equal(classification.severity, 'warning')
    assert.equal(classification.routeStatus, 'needs_review')
  })

  it('escalates unknown service-log fault text', () => {
    const classification = classifyDomsServiceMessage({
      seqNo: '13',
      message: 'RTC error detected by forecourt controller',
    })

    assert.equal(classification.routeKey, 'forecourt_fault')
    assert.equal(classification.severity, 'critical')
    assert.equal(classification.routeStatus, 'escalated')
  })

  it('classifies empty back-office buffer slots as ignored', () => {
    const classification = classifyDomsBackOfficeRecord({
      seqNo: '12',
      formatId: '51',
      subCode: '02H',
      borData: '',
      borLength: 0,
      payloadJson: { BorSeqNo: '12' },
    })

    assert.equal(classification.recordKind, 'empty_back_office_record')
    assert.equal(classification.processingStatus, 'ignored')
    assert.equal(classification.shouldReplay, false)
  })

  it('marks known back-office records as replayable pending records', () => {
    const classification = classifyDomsBackOfficeRecord({
      seqNo: '12',
      formatId: '51',
      subCode: '02H',
      borData: '<record/>',
      borLength: 9,
      payloadJson: { BorSeqNo: '12', BorFormatId: { value: '51' } },
    })

    assert.equal(classification.recordKind, 'client_store_record')
    assert.equal(classification.processingStatus, 'pending')
    assert.equal(classification.shouldReplay, true)
  })
})

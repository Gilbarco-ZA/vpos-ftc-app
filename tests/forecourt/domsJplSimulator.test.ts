import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DomsJplSimulatorResponder,
  encodeDomsJplFrame,
  extractDomsJplFrames,
} from '../../src/modules/forecourt/infrastructure/jpl/simulator'

describe('DOMS/JPL simulator harness', () => {
  it('encodes and extracts multiple framed JPL messages with a partial remainder', () => {
    const first = encodeDomsJplFrame({
      name: 'heartbeat',
      subCode: '00H',
      data: {},
    })
    const second = encodeDomsJplFrame({
      name: 'FcStatus_req',
      subCode: '00H',
      data: {},
      correlationId: 'abc-123',
    })
    const partial = encodeDomsJplFrame({
      name: 'FpStatus_req',
      subCode: '00H',
      data: { FpId: '01' },
    }).subarray(0, 8)

    const extracted = extractDomsJplFrames(
      Buffer.concat([Buffer.from('noise'), first, second, partial]),
    )

    assert.equal(extracted.frames.length, 2)
    assert.equal(extracted.frames[0].message?.name, 'heartbeat')
    assert.equal(extracted.frames[1].message?.name, 'FcStatus_req')
    assert.equal(extracted.frames[1].message?.correlationId, 'abc-123')
    assert.ok(extracted.remainder.length > 0)
  })

  it('returns logon response plus startup unsolicited state for a full scenario', () => {
    const responder = new DomsJplSimulatorResponder({ scenario: 'full' })
    const responses = responder.handleRequest({
      name: 'FcLogon_req',
      subCode: '01H',
      correlationId: 'logon-1',
      data: {
        FcAccessCode: 'POS,RI,UNSO_FPSTA_3',
        CountryCode: '0710',
        PosVersionId: 'vpos-test',
      },
    })

    assert.equal(responses[0].name, 'FcLogon_resp')
    assert.equal(responses[0].correlationId, 'logon-1')
    assert.ok(responses.some((entry) => entry.name === 'FcStatus_resp'))
    assert.ok(responses.some((entry) => entry.name === 'MultiMessage_resp'))
    assert.ok(responses.some((entry) => entry.name === 'SiteDeliveryStatus_resp'))
  })

  it('preserves correlation IDs on solicited status responses', () => {
    const responder = new DomsJplSimulatorResponder({ fcCount: 2 })
    const [response] = responder.handleRequest({
      name: 'FpStatus_req',
      subCode: '00H',
      correlationId: { id: 'fp-all' },
      data: { FpId: '00' },
    })

    assert.equal(response.name, 'MultiMessage_resp')
    assert.deepEqual(response.correlationId, { id: 'fp-all' })
    assert.equal(response.solicited, true)
    assert.equal((response.data.messages as unknown[]).length, 2)
  })

  it('returns syntax/access-safe reject responses for unsupported messages', () => {
    const responder = new DomsJplSimulatorResponder()
    const [response] = responder.handleRequest({
      name: 'Unsupported_req',
      subCode: '00H',
      correlationId: 'bad-request',
      data: {},
    })

    assert.equal(response.name, 'RejectMessage_resp')
    assert.equal(response.correlationId, 'bad-request')
    assert.equal((response.data.RejectCode as any).value, '01H')
    assert.match(String(response.data.RejectInfoText), /Unsupported/)
  })

  it('serves transaction recovery fixtures without clearing them implicitly', () => {
    const responder = new DomsJplSimulatorResponder({
      scenario: 'transaction-recovery',
    })
    const [first] = responder.handleRequest({
      name: 'FpSupTrans_req',
      subCode: '00H',
      data: { FpId: '01', PosId: '01', TransSeqNo: '0201' },
    })
    const [second] = responder.handleRequest({
      name: 'FpSupTrans_req',
      subCode: '00H',
      data: { FpId: '01', PosId: '01', TransSeqNo: '0201' },
    })

    assert.equal(first.name, 'FpSupTrans_resp')
    assert.equal(first.data.TransSeqNo, '0201')
    assert.deepEqual(second.data, first.data)
  })
})

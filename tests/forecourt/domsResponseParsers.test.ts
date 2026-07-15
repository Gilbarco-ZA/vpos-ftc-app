import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseDomsJplResponse,
  summarizeParsedDomsResponses,
  supportedJplResponseNames,
} from '../../src/modules/forecourt/infrastructure/jpl/protocol/responses'

describe('DOMS/JPL typed response parsers', () => {
  it('parses forecourt controller status into internal domain flags', () => {
    const parsed = parseDomsJplResponse({
      name: 'FcStatus_resp',
      subCode: '00H',
      solicited: false,
      data: {
        FcStatus1Flags: {
          value: 4,
          bits: { FallbackMode: 4 },
        },
        FcStatus2Flags: {
          value: 33,
          bits: { ServiceMsgReady: 1, BackOfficeRecordExists: 32 },
        },
      },
    })

    assert.equal(parsed.family, 'forecourt')
    assert.equal(parsed.status, 'warning')
    assert.equal(parsed.normalized.fallbackMode, true)
    assert.equal(parsed.normalized.serviceMessageReady, true)
    assert.equal(parsed.normalized.backOfficeRecordExists, true)
  })

  it('flattens MultiMessage response summaries without losing child parsers', () => {
    const parsed = parseDomsJplResponse({
      name: 'MultiMessage_resp',
      subCode: '00H',
      solicited: true,
      data: {
        messages: [
          {
            name: 'FpStatus_resp',
            subCode: '00H',
            data: {
              FpId: '01',
              FpMainState: { enum: { Idle: '01H' }, value: '01H' },
              FpSubStates: { value: 4, bits: { IsOnline: 4 } },
            },
          },
          {
            name: 'TgStatus_resp',
            subCode: '00H',
            data: {
              TgId: '02',
              TgMainState: { enum: { Idle: '01H' }, value: '01H' },
              TgSubStates: { value: 4, bits: { TankGaugeOnline: 4 } },
            },
          },
        ],
      },
    })

    assert.equal(parsed.name, 'MultiMessage_resp')
    assert.equal(parsed.children?.length, 2)
    assert.equal(parsed.children?.[0].family, 'dispense')
    assert.equal(parsed.children?.[1].family, 'wetstock')
    assert.equal(parsed.normalized.childCount, 2)
  })

  it('classifies empty and non-empty back office records', () => {
    const empty = parseDomsJplResponse(
      {
        name: 'BackOfficeRecord_resp',
        subCode: '02H',
        solicited: true,
        data: { BorSeqNo: '12', BorFormatId: { value: '51' }, BorData: '' },
      },
      { stationId: 'station-1' },
    )
    const nonEmpty = parseDomsJplResponse(
      {
        name: 'BackOfficeRecord_resp',
        subCode: '02H',
        solicited: true,
        data: { BorSeqNo: '13', BorFormatId: { value: '51' }, BorData: '<xml />' },
      },
      { stationId: 'station-1' },
    )

    assert.equal(empty.status, 'empty')
    assert.equal(empty.normalized.empty, true)
    assert.equal(nonEmpty.status, 'warning')
    assert.equal(nonEmpty.normalized.empty, false)
  })

  it('dispatches every registered response parser without falling back to unknown', () => {
    const names = supportedJplResponseNames()
    assert.ok(names.length > 0)

    for (const name of names) {
      const parsed = parseDomsJplResponse(
        {
          name,
          subCode: name === 'RejectMessage_resp' ? '01H' : '00H',
          solicited: true,
          data:
            name === 'RejectMessage_resp'
              ? {
                  RejectCode: {
                    enum: { syntax_error: '02H' },
                    value: '02H',
                  },
                  RejectInfoText: 'Parser registry fixture',
                }
              : {},
        },
        { stationId: 'parser-registry-test' },
      )

      assert.equal(parsed.name, name)
      assert.notEqual(
        parsed.family,
        'unknown',
        `${name} should use a registered parser`,
      )
    }
  })

  it('summarizes parsed response status and family counts', () => {
    const responses = [
      parseDomsJplResponse({
        name: 'heartbeat',
        subCode: '00H',
        solicited: false,
        data: {},
      }),
      parseDomsJplResponse({
        name: 'RejectMessage_resp',
        subCode: '01H',
        solicited: true,
        data: {
          RejectCode: { enum: { syntax_error: '02H' }, value: '02H' },
          RejectInfoText: 'Object does not contain a subCode property',
        },
      }),
    ]

    const summary = summarizeParsedDomsResponses(responses)
    assert.equal(summary.total, 2)
    assert.equal(summary.byStatus.ok, 1)
    assert.equal(summary.byStatus.error, 1)
    assert.equal(summary.byFamily.connection, 1)
    assert.equal(summary.byFamily.reject, 1)
    assert.ok(supportedJplResponseNames().includes('FpStatus_resp'))
  })
})

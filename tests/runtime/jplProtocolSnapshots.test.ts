import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  rememberGatewaySnapshot,
  toResponseEnvelopeData,
} from '@/src/platform/integrations/jpl/protocol/snapshots'
import { getJplAdapterState } from '@/src/shared/forecourt/jplState'

describe('JPL protocol snapshots', () => {
  it('unwraps response envelopes without changing direct payloads', () => {
    assert.deepEqual(toResponseEnvelopeData({ data: { value: 1 } }), {
      value: 1,
    })
    assert.deepEqual(
      toResponseEnvelopeData({ payload: { data: { value: 2 } } }),
      { value: 2 },
    )
    assert.deepEqual(toResponseEnvelopeData({ payload: { value: 3 } }), {
      value: 3,
    })
    assert.deepEqual(toResponseEnvelopeData({ value: 4 }), { value: 4 })
  })

  it('stores normalized fuelling-point and tank snapshots by identifier', () => {
    const fp = rememberGatewaySnapshot(
      'FpStatus_resp',
      {
        data: {
          FpId: '41',
          FpMainState: { enum: { Idle: 1 } },
          FpSubStates: { bits: { IsOnline: true } },
        },
      },
      '00H',
    )
    const tg = rememberGatewaySnapshot(
      'TgStatus_resp',
      {
        payload: {
          data: {
            TgId: '42',
            TgSubStates: { bits: { TankGaugeOnline: true } },
          },
        },
      },
      '01H',
    )

    const state = getJplAdapterState()
    assert.equal(fp.fpId, '41')
    assert.equal(tg.tgId, '42')
    assert.equal(state.lastFpStatuses?.[0]?.fpId, '41')
    assert.equal(state.lastFpStatuses?.[0]?.subCode, '00H')
    assert.equal(state.lastTgStatuses?.[0]?.tgId, '42')
    assert.equal(state.lastTgStatuses?.[0]?.subCode, '01H')
  })

  it('records each supported protocol snapshot family', () => {
    rememberGatewaySnapshot('FpInfo_resp', { FpId: '44' }, '00H')
    rememberGatewaySnapshot(
      'FpFuellingData_resp',
      { FpId: '45', Vol_e: '1000' },
      '00H',
    )
    rememberGatewaySnapshot(
      'FpErrorMsg_resp',
      { FpId: '46', FpErrorCode: { value: '49' } },
      '00H',
    )
    rememberGatewaySnapshot('TgData_resp', { TgId: '47' }, '00H')
    rememberGatewaySnapshot(
      'SiteDeliveryStatus_resp',
      {
        DeliveryStatusFlags: { bits: { SiteDeliveryDataIsReady: true } },
        TankDeliveries: ['48'],
      },
      '01H',
    )
    rememberGatewaySnapshot(
      'TankDeliveryData_resp',
      {
        TgId: '48',
        DeliveryReportSeqNo: '01',
        TankDeliverySeqNo: '02',
      },
      '00H',
    )

    const state = getJplAdapterState()
    assert.equal(state.lastFpInfo?.[0]?.fpId, '44')
    assert.equal(state.lastFpFuellingData?.[0]?.fpId, '45')
    assert.equal(state.lastFpErrors?.[0]?.fpId, '46')
    assert.equal(state.lastTgData?.[0]?.tgId, '47')
    assert.equal(state.lastSiteDeliveryStatus?.subCode, '01H')
    assert.equal(state.lastTankDeliveryData?.[0]?.tgId, '48')
    assert.equal(state.lastTankDeliveryData?.[0]?.deliveryReportSeqNo, '01')
  })

  it('replaces an existing snapshot key and leaves unknown responses unchanged', () => {
    rememberGatewaySnapshot('TgStatus_resp', { TgId: '43' }, '00H')
    rememberGatewaySnapshot(
      'TgStatus_resp',
      { TgId: '43', TgSubStates: { bits: { DeliveryDataReady: true } } },
      '02H',
    )

    const matching = (getJplAdapterState().lastTgStatuses ?? []).filter(
      (entry) => entry.tgId === '43',
    )
    assert.equal(matching.length, 1)
    assert.equal(matching[0]?.subCode, '02H')
    assert.deepEqual(rememberGatewaySnapshot('Unknown_resp', { value: 9 }), {
      value: 9,
    })
  })
})

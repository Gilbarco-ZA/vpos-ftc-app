import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildJplCommandRequest } from '../../src/modules/forecourt/infrastructure/jpl/protocol/commands'
import {
  normalizeJplSiteDeliveryStatus,
  normalizeJplTankAlarmStatus,
  normalizeJplTankDeliveryData,
  normalizeJplTankGaugeData,
} from '../../src/shared/doms/tankGaugeProtocol'

describe('DOMS/JPL wetstock normalization', () => {
  it('maps tank gauge alarms to typed active alarms and severities', () => {
    const normalized = normalizeJplTankAlarmStatus({
      TgAlarmStatus: {
        value: 16388,
        bits: {
          LowLevelAlarm: 4,
          DeliveryDataLost: 16384,
        },
      },
      TgAlarmTxts: [
        {
          TgAlarmNo: { value: '0004H' },
          TgProtocolId: '12',
          TgAlarmTxt: 'Low level from gauge',
        },
        {
          TgAlarmCode: '000FH',
          TgProtocolId: '12',
          TgAlarmTxt: 'Delivery data lost',
        },
      ],
    })

    assert.deepEqual(
      normalized.active.map((alarm) => alarm.key),
      ['lowLevel', 'deliveryDataLost'],
    )
    assert.equal(normalized.active[0]?.code, '0003H')
    assert.equal(normalized.active[0]?.severity, 'warning')
    assert.equal(normalized.active[0]?.text, 'Low level from gauge')
    assert.equal(normalized.active[1]?.code, '000FH')
  })

  it('parses the expanded tank gauge data item surface used by reporting', () => {
    const normalized = normalizeJplTankGaugeData({
      TgId: '3',
      TankDataItems: {
        TankId: '3',
        TgProductCode: '2',
        TankGroupId: '4',
        TankGaugeType: 'VR',
        TankProductLevel: '1234',
        TankWaterLevel: '50',
        TankTotalObservedVol: '10000',
        TankWaterVol: '20',
        TankGrossObservedVol: '9800',
        TankGrossStdVol: '9700',
        TankAvailableRoom: '1200',
        TankAverageTemp: { TempValue: '225', FcSign: '00H' },
        TankDataLastUpdateDateAndTime: '20260709101030',
        TankProductDensity: '745',
        TankProductTcDensity: '742',
        TankDensityProbeTemp: { TempValue: '227', FcSign: '00H' },
        TankAdjustedVolume: '10',
        TankAdjustedTCVolume: '8',
        TankDeliveredVol: '3500',
        TankDeliveredTcVol: '3490',
        TankDeliveredMass: '2600',
        TankDeliveredQuantity: '3510',
        TankPressure: '12',
      },
    })

    assert.equal(normalized?.tgId, '03')
    assert.equal(normalized?.tankId, '03')
    assert.equal(normalized?.productCode, '2')
    assert.equal(normalized?.groupId, '4')
    assert.equal(normalized?.productLevel, 1234)
    assert.equal(normalized?.grossObservedVolume, 9800)
    assert.equal(normalized?.averageTemperatureC, 22.5)
    assert.equal(normalized?.densityProbeTemperatureC, 22.7)
    assert.equal(normalized?.deliveredVolume, 3500)
    assert.equal(normalized?.pressure, 12)
    assert.equal(normalized?.lastUpdatedAt, '2026-07-09T10:10:30.000Z')
  })

  it('normalizes delivery status into clear candidates', () => {
    const normalized = normalizeJplSiteDeliveryStatus({
      DeliveryStatusFlags: {
        value: 24,
        bits: {
          SiteDeliveryDataIsReady: 8,
          SiteTicketedDeliveryDataIsReady: 16,
        },
      },
      DeliveryReportSeqNo: '7',
      TankDeliveries: ['3'],
      TankTicketedDeliveries: ['4'],
    })

    assert.equal(normalized.status, 'data_ready')
    assert.equal(normalized.deliveryReportSeqNo, '07')
    assert.deepEqual(normalized.readyTgIds, ['03', '04'])
    assert.deepEqual(normalized.clearCandidates, [
      { tgId: '03', deliveryReportSeqNo: '07' },
      { tgId: '04', deliveryReportSeqNo: '07' },
    ])
  })

  it('normalizes tank delivery data with protocol clear target metadata', () => {
    const normalized = normalizeJplTankDeliveryData({
      PosId: '2',
      TgId: '3',
      DeliveryReportSeqNo: '7',
      TankDeliveryDataItems: {
        TankDeliverySeqNo: '9',
        TankDeliveredVol: '3500',
        TankDeliveredTcVol: '3490',
        TankDeliveredMass: '2600',
        TankDeliverySaleVolDuringDelivery: '120',
        TankDeliveryTemperature: { TempValue: '219', FcSign: '00H' },
        TankDeliveryStartDateAndTime: '20260709090000',
        TankDeliveryStopDateAndTime: '20260709093000',
      },
    })

    assert.equal(normalized.tgId, '03')
    assert.equal(normalized.deliveryReportSeqNo, '07')
    assert.equal(normalized.tankDeliverySeqNo, '09')
    assert.equal(normalized.deliveredVolume, 3500)
    assert.equal(normalized.deliveryTemperatureC, 21.9)
    assert.deepEqual(normalized.clearTarget, {
      tgId: '03',
      tankDeliverySeqNo: '09',
      deliveryReportSeqNo: '07',
      posId: '02',
    })
  })

  it('requests only protocol-defined TankDataItemId values by default', () => {
    const request = buildJplCommandRequest('READ_TG_DATA', { tgId: 3 })

    assert.ok(request)
    assert.ok(request.data)
    assert.equal(request.name, 'TgData_req')
    assert.equal(request.data.TgId, '03')
    assert.deepEqual(request.data.TankDataItemId, [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '41',
      '42',
      '43',
      '44',
    ])
    assert.equal(request.data.TankDataItemId.includes('12'), false)
    assert.equal(request.data.TankDataItemId.includes('13'), false)
  })
})

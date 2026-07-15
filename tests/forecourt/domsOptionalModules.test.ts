import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  extractSensorAlarmErrors,
  extractVendingAlarmErrors,
  normalizePricePoleError,
  normalizePricePoleSnapshot,
  normalizeSensorSnapshot,
  normalizeVendingSnapshot,
  normalizeVendingTotals,
} from '../../src/modules/forecourt/infrastructure/jpl/optionalModules'
import { buildJplCommandRequest } from '../../src/modules/forecourt/infrastructure/jpl/protocol/commands'

describe('DOMS/JPL optional module runtime normalization', () => {
  it('normalizes price-pole snapshots and errors', () => {
    const snapshot = normalizePricePoleSnapshot({
      PpId: '2',
      PpMainState: { enum: { Open: '02H' }, value: '02H' },
      PpSubStates: { value: 4, bits: { IsOnline: 4 } },
      PpLockId: '1',
      PpText: 'Main pole',
    })

    assert.equal(snapshot?.family, 'price_pole')
    assert.equal(snapshot?.deviceId, '2')
    assert.equal(snapshot?.mainState, 'Open')
    assert.equal(snapshot?.operationalStatus, 'online')
    assert.equal(snapshot?.severity, 'ok')
    assert.equal(snapshot?.lockId, '1')
    assert.ok(snapshot?.sourceHash)

    const error = normalizePricePoleError({
      PpId: '2',
      PpErrorCode: { enum: { CommunicationError: '04' }, value: '04' },
      PpErrorDateAndTime: '20260709122000',
      PpErrorTxt: 'Pole offline',
    })

    assert.equal(error?.family, 'price_pole')
    assert.equal(error?.deviceId, '2')
    assert.equal(error?.errorName, 'CommunicationError')
    assert.equal(error?.errorCode, '04')
    assert.equal(error?.errorText, 'Pole offline')
    assert.equal(error?.severity, 'error')
  })

  it('normalizes sensor snapshots and extracts active alarms', () => {
    const payload = {
      SensorId: '7',
      SensorMainState: { enum: { Error: '03H' }, value: '03H' },
      SensorSubStates: { value: 4, bits: { IsOnline: 4 } },
      PssExtProtocolId: '76A4H',
      SensorName: 'Sump sensor',
      ActiveSensorAlarms: [
        {
          SensorAlarmSeqNo: 1,
          SensorAlarmCode: [12, 15],
          SensorAlarmName: 'High water',
          SensorAlarmDateAndTime: '20260709123000',
        },
      ],
    }

    const snapshot = normalizeSensorSnapshot(payload)
    assert.equal(snapshot?.family, 'sensor')
    assert.equal(snapshot?.deviceId, '7')
    assert.equal(snapshot?.operationalStatus, 'error')
    assert.equal(snapshot?.severity, 'error')
    assert.equal(snapshot?.alarmActive, true)
    assert.equal(snapshot?.label, 'Sump sensor')

    const alarms = extractSensorAlarmErrors(payload)
    assert.equal(alarms.length, 1)
    assert.equal(alarms[0]?.family, 'sensor')
    assert.equal(alarms[0]?.deviceId, '7')
    assert.equal(alarms[0]?.errorCode, '12,15')
    assert.equal(alarms[0]?.errorName, 'High water')
    assert.equal(alarms[0]?.severity, 'warning')
  })

  it('normalizes vending snapshots, alarms, and totals', () => {
    const statusPayload = {
      VmId: '4',
      VmMainState: { enum: { Active: '02H' }, value: '02H' },
      VmSubStates: {
        value: 84,
        bits: { IsOnline: 4, HasFreeBuffer: 16, Error: 32 },
      },
      VmLockId: '3',
      FcDrystockNumber: 'COFFEE-01',
      ActiveVmAlarms: [{ VmAlarmCode: [5], VmAlarmName: 'Door open' }],
    }

    const snapshot = normalizeVendingSnapshot(statusPayload)
    assert.equal(snapshot?.family, 'vending')
    assert.equal(snapshot?.deviceId, '4')
    assert.equal(snapshot?.operationalStatus, 'error')
    assert.equal(snapshot?.severity, 'error')
    assert.equal(snapshot?.lockId, '3')
    assert.equal(snapshot?.label, 'COFFEE-01')

    const alarms = extractVendingAlarmErrors(statusPayload)
    assert.equal(alarms.length, 1)
    assert.equal(alarms[0]?.errorCode, '5')
    assert.equal(alarms[0]?.errorName, 'Door open')

    const totals = normalizeVendingTotals({
      VmId: '4',
      VmTotalType: { enum: { Machine: '02H' }, value: '02H' },
      VmGrandCountTotal: '000000000123',
      VmGrandMoneyTotal: '000000004500',
      VmDrystockTotalsInfo: { value: 3, bits: { GrandCount: 1 } },
      VmDrystockItems: [
        { FcDrystockNumber: 'COFFEE-01', VmCountTotal: '000000000100' },
      ],
    })

    assert.equal(totals?.vmId, '4')
    assert.equal(totals?.vmTotalType, '02H')
    assert.equal(totals?.vmTotalTypeLabel, 'Machine')
    assert.equal(totals?.grandCountTotal, '000000000123')
    assert.equal(totals?.items.length, 1)
    assert.ok(totals?.sourceHash)
  })

  it('builds vending command envelopes with required DOMS fields', () => {
    const open = buildJplCommandRequest('OPEN_VM', {
      vmId: 4,
      posId: 2,
      vmOperationModeNo: 1,
    })

    assert.ok(open)
    assert.equal(open.name, 'open_Vm_req')
    assert.equal(open.subCode, '00H')
    assert.deepEqual(open.data, {
      VmId: '04',
      PosId: '02',
      VmOperationModeNo: 1,
    })

    const totals = buildJplCommandRequest('READ_VM_TOTALS', { vmId: 4 })
    assert.ok(totals)
    assert.ok(totals.data)
    assert.equal(totals.name, 'VmDrystockTotals_req')
    assert.equal(totals.data.VmId, '04')
    assert.equal(totals.data.VmTotalType, '01H')
  })
})

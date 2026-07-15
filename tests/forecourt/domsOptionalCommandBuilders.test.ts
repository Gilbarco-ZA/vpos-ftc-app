import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildJplCommandRequest } from '../../src/modules/forecourt/infrastructure/jpl/protocol/commands'

type CommandFixture = {
  action: string
  payload: Record<string, unknown>
  name: string
  subCode?: string
}

const optionalCommandFixtures: CommandFixture[] = [
  { action: 'GET_PP_STATUS', payload: { ppId: 1 }, name: 'PpStatus_req' },
  {
    action: 'OPEN_PP',
    payload: { ppId: 1, posId: 2, ppOperationModeNo: 3 },
    name: 'open_Pp_req',
  },
  { action: 'CLOSE_PP', payload: { ppId: 1 }, name: 'close_Pp_req' },
  { action: 'GET_PP_ERROR', payload: { ppId: 1 }, name: 'PpErrorMsg_req' },
  {
    action: 'CLEAR_PP_ERROR',
    payload: { ppId: 1, ppErrorCode: 4 },
    name: 'clear_PpError_req',
  },
  { action: 'RESET_PP', payload: { ppId: 1 }, name: 'reset_Pp_req' },
  {
    action: 'CHANGE_WP_OPERATION_MODE_SET',
    payload: {
      wpId: 3,
      wpOperationModes: [
        {
          wpOperationModeNo: 1,
          wpOperationType: 0,
          wpServiceModes: [
            { wpSmId: 81, wpWmgId: 1, fcPriceGroupId: 1 },
          ],
        },
      ],
    },
    name: 'change_WpOperationModeSet_req',
  },
  {
    action: 'OPEN_WP',
    payload: { wpId: 3, posId: 2, wpOperationModeNo: 1 },
    name: 'open_Wp_req',
  },
  { action: 'CLOSE_WP', payload: { wpId: 3 }, name: 'close_Wp_req' },
  { action: 'GET_WP_STATUS', payload: { wpId: 3 }, name: 'WpStatus_req' },
  {
    action: 'PREPARE_WP_AUTH',
    payload: {
      wpId: 3,
      posId: 2,
      wpValidWashPrograms: [1],
      wpStartLimit: { WpStartLimitType: '02H', MoneyPresetLimit: '000500' },
    },
    name: 'prepare_WpAuth_req',
  },
  {
    action: 'AUTHORIZE_WP',
    payload: { wpId: 3, posId: 2, wpValidWashPrograms: [1] },
    name: 'authorize_Wp_req',
  },
  {
    action: 'CANCEL_WP_AUTH',
    payload: { wpId: 3, posId: 2 },
    name: 'cancel_WpAuth_req',
  },
  {
    action: 'STOP_WP',
    payload: { wpId: 3, posId: 2 },
    name: 'stop_Wp_req',
  },
  {
    action: 'RESUME_WP',
    payload: { wpId: 3, posId: 2 },
    name: 'cancel_WpStop_req',
  },
  { action: 'GET_WP_ERROR', payload: { wpId: 3 }, name: 'WpErrorMsg_req' },
  {
    action: 'CLEAR_WP_ERROR',
    payload: { wpId: 3, wpErrorCode: 4 },
    name: 'clear_WpError_req',
  },
  { action: 'RESET_WP', payload: { wpId: 3 }, name: 'reset_Wp_req' },
  {
    action: 'GET_WP_UNSUPERVISED_TRANSACTION',
    payload: { wpId: 3, posId: 2, transSeqNo: 7 },
    name: 'WpUnSupTrans_req',
  },
  {
    action: 'UNLOCK_WP_UNSUPERVISED_TRANSACTION',
    payload: { wpId: 3, posId: 2, transSeqNo: 7 },
    name: 'unlock_WpUnSupTrans_req',
  },
  {
    action: 'CLEAR_WP_UNSUPERVISED_TRANSACTION',
    payload: { wpId: 3, posId: 2, transSeqNo: 7, money: '000500' },
    name: 'clear_WpUnSupTrans_req',
  },
  {
    action: 'GET_DIOP_STATUS',
    payload: { diopId: 4 },
    name: 'DiopStatus_req',
  },
  {
    action: 'CHANGE_DIOP_OUTPUT',
    payload: { diopId: 4, diopControl: 1 },
    name: 'change_DiopOutput_req',
  },
  {
    action: 'GET_SENSOR_STATUS',
    payload: { sensorId: 5 },
    name: 'SensorStatus_req',
  },
  { action: 'GET_VM_STATUS', payload: { vmId: 6 }, name: 'VmStatus_req' },
  {
    action: 'OPEN_VM',
    payload: { vmId: 6, posId: 2, vmOperationModeNo: 1 },
    name: 'open_Vm_req',
  },
  { action: 'CLOSE_VM', payload: { vmId: 6 }, name: 'close_Vm_req' },
  {
    action: 'GET_VM_DRYSTOCK_TOTALS',
    payload: { vmId: 6, vmTotalType: 2 },
    name: 'VmDrystockTotals_req',
  },
  { action: 'GET_VM_ERROR', payload: { vmId: 6 }, name: 'VmErrorMsg_req' },
  {
    action: 'CLEAR_VM_ERROR',
    payload: { vmId: 6, vmErrorCode: 4 },
    name: 'clear_VmError_req',
  },
  { action: 'RESET_VM', payload: { vmId: 6 }, name: 'reset_Vm_req' },
  {
    action: 'CLEAR_SERIAL_SERVER_INSTALLATION',
    payload: { serialServerId: 7 },
    name: 'clear_InstallData_req',
    subCode: '01H',
  },
]

describe('DOMS/JPL optional module command builders', () => {
  for (const fixture of optionalCommandFixtures) {
    it(`builds ${fixture.action}`, () => {
      const request = buildJplCommandRequest(fixture.action, fixture.payload)
      assert.ok(request, `${fixture.action} should produce a request`)
      assert.equal(request.name, fixture.name)
      assert.equal(request.subCode, fixture.subCode ?? '00H')
      assert.ok(request.data && typeof request.data === 'object')
    })
  }

  it('normalizes optional module identifiers and command-specific values', () => {
    const pricePole = buildJplCommandRequest('OPEN_PP', {
      ppId: 1,
      posId: 2,
      ppOperationModeNo: 3,
    })
    assert.deepEqual(pricePole?.data, {
      PpId: '01',
      PosId: '02',
      PpOperationModeNo: 3,
    })

    const washTransaction = buildJplCommandRequest(
      'GET_WP_UNSUPERVISED_TRANSACTION',
      { wpId: 3, posId: 2, transSeqNo: 7 },
    )
    assert.deepEqual(washTransaction?.data, {
      WpId: '03',
      TransSeqNo: '0007',
      PosId: '02',
      WpTransParId: ['41'],
      RcpItemIdEptRd: [],
    })

    const digitalOutput = buildJplCommandRequest('CHANGE_DIOP_OUTPUT', {
      diopId: 4,
      diopControl: 1,
    })
    assert.deepEqual(digitalOutput?.data, {
      DiopId: '04',
      DiopControl: '01H',
    })

    const vendingTotals = buildJplCommandRequest('GET_VM_DRYSTOCK_TOTALS', {
      vmId: 6,
      vmTotalType: 2,
    })
    assert.deepEqual(vendingTotals?.data, {
      VmId: '06',
      VmTotalType: '02H',
    })

    const serialServer = buildJplCommandRequest(
      'CLEAR_SERIAL_SERVER_INSTALLATION',
      { serialServerId: 7 },
    )
    assert.deepEqual(serialServer?.data, {
      ExtendedInstallMsgCode: '0201H',
      FcDeviceId: '07',
    })
  })
})

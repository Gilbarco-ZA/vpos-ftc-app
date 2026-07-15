import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildJplCommandRequest,
  JPL_COMMAND_NAMES,
  type JplCommandName,
} from '../../src/modules/forecourt/infrastructure/jpl/protocol/commands'

type BuilderFixture = {
  name: JplCommandName
  action: string
  payload?: Record<string, unknown>
}

const basePayload: Record<string, unknown> = {
  pumpNumber: 1,
  fpId: 1,
  posId: 2,
  transSeqNo: 1,
  money: '000500',
  Money: '000500',
  Money_e: '0000000500',
  Vol_e: '0000000100',
  tankId: 1,
  tgId: 1,
  ppId: 1,
  wpId: 1,
  diopId: 1,
  sensorId: 1,
  vmId: 1,
  fpErrorCode: 1,
  tgErrorCode: 1,
  ppErrorCode: 1,
  wpErrorCode: 1,
  vmErrorCode: 1,
  fbTotalsSeqNo: 1,
  totalNoFbTransactions: 1,
  fcServiceMsgSeqNo: 1,
  borSeqNo: 1,
  clientDataOffset: 0,
  clientDataLen: 1,
  clientData: ['01H'],
  echoData: [1],
}

const withBase = (payload: Record<string, unknown> = {}) => ({
  ...basePayload,
  ...payload,
})

const fixtures: BuilderFixture[] = [
  { name: 'open_Fp_req', action: 'OPEN_FP' },
  { name: 'close_Fp_req', action: 'CLOSE_FP' },
  { name: 'authorize_Fp_req', action: 'AUTHORIZE_FP' },
  {
    name: 'prepare_Trans_req',
    action: 'PREPARE_TRANSACTION',
    payload: {
      serviceModeId: 21,
      extendedStartLimit: { type: 2, moneyLimit: 500 },
    },
  },
  { name: 'cancel_FpAuth_req', action: 'CANCEL_FP_AUTH' },
  { name: 'clear_FpError_req', action: 'CLEAR_FP_ERROR' },
  { name: 'FpSupTrans_req', action: 'GET_SUPERVISED_TRANSACTION' },
  { name: 'unlock_FpSupTrans_req', action: 'UNLOCK_SUPERVISED_TRANSACTION' },
  { name: 'clear_FpSupTrans_req', action: 'CLEAR_SUPERVISED_TRANSACTION' },
  { name: 'FpUnSupTrans_req', action: 'GET_UNSUPERVISED_TRANSACTION' },
  {
    name: 'unlock_FpUnSupTrans_req',
    action: 'UNLOCK_UNSUPERVISED_TRANSACTION',
  },
  { name: 'clear_FpUnSupTrans_req', action: 'CLEAR_UNSUPERVISED_TRANSACTION' },
  { name: 'FpStatus_req', action: 'GET_FP_STATUS' },
  { name: 'FpInfo_req', action: 'GET_FP_INFO' },
  { name: 'FpFuellingData_req', action: 'GET_FP_FUELLING_DATA' },
  { name: 'FpErrorMsg_req', action: 'GET_FP_ERROR' },
  { name: 'FpGradeTotals_req', action: 'GET_FP_GRADE_TOTALS' },
  { name: 'PumpGradeTotals_req', action: 'GET_PUMP_GRADE_TOTALS' },
  {
    name: 'PumpGradeBlendTotals_req',
    action: 'GET_PUMP_GRADE_BLEND_TOTALS',
  },
  { name: 'FbTotals_req', action: 'GET_FALLBACK_TOTALS' },
  { name: 'clear_FallbackTotals_req', action: 'CLEAR_FALLBACK_TOTALS' },
  { name: 'estop_Fp_req', action: 'ESTOP_FP' },
  { name: 'cancel_FpEstop_req', action: 'CANCEL_FP_ESTOP' },
  { name: 'reset_Fp_req', action: 'RESET_FP' },
  { name: 'TgStatus_req', action: 'GET_TG_STATUS' },
  { name: 'open_TankController_req', action: 'OPEN_TANK_CONTROLLER' },
  { name: 'close_TankController_req', action: 'CLOSE_TANK_CONTROLLER' },
  { name: 'TankControlStatus_req', action: 'GET_TANK_CONTROL_STATUS' },
  { name: 'block_Tank_req', action: 'BLOCK_TANK' },
  { name: 'unblock_Tank_req', action: 'UNBLOCK_TANK' },
  {
    name: 'start_DeliveryProcess_req',
    action: 'START_DELIVERY_PROCESS',
    payload: {
      fcProductId: 1,
      startDeliveryProcessPars: {
        FcProductName: 'Diesel',
        TankControlSmId: '01',
      },
    },
  },
  { name: 'stop_DeliveryProcess_req', action: 'STOP_DELIVERY_PROCESS' },
  {
    name: 'mark_DeliveryStarting_req',
    action: 'MARK_DELIVERY_STARTING',
    payload: { deliveryReturnBytes: ['01H'] },
  },
  { name: 'mark_DeliveryFinished_req', action: 'MARK_DELIVERY_FINISHED' },
  { name: 'SiteDeliveryStatus_req', action: 'GET_SITE_DELIVERY_STATUS' },
  {
    name: 'TankDeliveryData_req',
    action: 'GET_TANK_DELIVERY_DATA',
    payload: { tankDeliveryItemId: [1] },
  },
  {
    name: 'clear_TankDeliveryData_req',
    action: 'CLEAR_TANK_DELIVERY_DATA',
    payload: {
      deliveryReportSeqNo: 1,
      tankDeliveries: [{ tgId: 1, tankDeliverySeqNo: 1 }],
    },
  },
  {
    name: 'clear_InstallData_req',
    action: 'CLEAR_INSTALLATION_DATA',
    payload: { extendedInstallMsgCode: '0201H', fcDeviceId: 1 },
  },
  { name: 'PpStatus_req', action: 'GET_PP_STATUS' },
  { name: 'open_Pp_req', action: 'OPEN_PP', payload: { ppOperationModeNo: 1 } },
  { name: 'close_Pp_req', action: 'CLOSE_PP' },
  { name: 'PpErrorMsg_req', action: 'GET_PP_ERROR' },
  { name: 'clear_PpError_req', action: 'CLEAR_PP_ERROR' },
  { name: 'reset_Pp_req', action: 'RESET_PP' },
  { name: 'WpStatus_req', action: 'GET_WP_STATUS' },
  {
    name: 'prepare_WpAuth_req',
    action: 'PREPARE_WP_AUTH',
    payload: { wpValidWashPrograms: [1] },
  },
  {
    name: 'authorize_Wp_req',
    action: 'AUTHORIZE_WP',
    payload: { wpValidWashPrograms: [1] },
  },
  { name: 'cancel_WpAuth_req', action: 'CANCEL_WP_AUTH' },
  { name: 'stop_Wp_req', action: 'STOP_WP' },
  { name: 'cancel_WpStop_req', action: 'RESUME_WP' },
  { name: 'WpErrorMsg_req', action: 'GET_WP_ERROR' },
  { name: 'clear_WpError_req', action: 'CLEAR_WP_ERROR' },
  { name: 'reset_Wp_req', action: 'RESET_WP' },
  { name: 'clear_TgError_req', action: 'CLEAR_TG_ERROR' },
  { name: 'reset_Tg_req', action: 'RESET_TG' },
  { name: 'FcDateAndTime_req', action: 'GET_FC_DATE_TIME' },
  {
    name: 'change_FcDateAndTime_req',
    action: 'CHANGE_FC_DATE_TIME',
    payload: { fcDateAndTime: '20260710120000' },
  },
  { name: 'FcOperationModeStatus_req', action: 'GET_FC_OPERATION_MODE_STATUS' },
  {
    name: 'change_FcOperationModeNo_req',
    action: 'CHANGE_FC_OPERATION_MODE',
    payload: { fcOperationModeNo: 1 },
  },
  { name: 'UtilEcho_req', action: 'UTIL_ECHO' },
  { name: 'DiopStatus_req', action: 'GET_DIOP_STATUS' },
  {
    name: 'change_DiopOutput_req',
    action: 'CHANGE_DIOP_OUTPUT',
    payload: { diopControl: 1 },
  },
  { name: 'SensorStatus_req', action: 'GET_SENSOR_STATUS' },
  { name: 'VmStatus_req', action: 'GET_VM_STATUS' },
  { name: 'open_Vm_req', action: 'OPEN_VM', payload: { vmOperationModeNo: 1 } },
  { name: 'close_Vm_req', action: 'CLOSE_VM' },
  {
    name: 'VmDrystockTotals_req',
    action: 'GET_VM_DRYSTOCK_TOTALS',
    payload: { vmTotalType: 1 },
  },
  { name: 'VmErrorMsg_req', action: 'GET_VM_ERROR' },
  { name: 'clear_VmError_req', action: 'CLEAR_VM_ERROR' },
  { name: 'reset_Vm_req', action: 'RESET_VM' },
  { name: 'FcPriceSetStatus_req', action: 'GET_PRICE_SET_STATUS' },
  { name: 'FcPriceSet_req', action: 'GET_CURRENT_PRICE_SET' },
  {
    name: 'change_FcPriceSet_req',
    action: 'CHANGE_PRICE_SET',
    payload: {
      userId: 'operator',
      fcPriceSetId: 1,
      fcPriceGroupIds: [1],
      fcGradeIds: [1],
      fcPriceGroups: [['000100']],
      activationAt: '00000000000000',
    },
  },
  { name: 'clear_PendingFcPriceSet_req', action: 'CLEAR_PENDING_PRICE_SET' },
  {
    name: 'change_FcStatusUpdateMode_req',
    action: 'CHANGE_FC_STATUS_UPDATE_MODE',
    payload: { statusUpdateCode: 3 },
  },
  { name: 'FcStatus_req', action: 'GET_FC_STATUS' },
  { name: 'FcInstallStatus_req', action: 'GET_FC_INSTALL_STATUS' },
  { name: 'PosConnectionStatus_req', action: 'GET_POS_CONNECTION_STATUS' },
  { name: 'PssPeripheralsStatus_req', action: 'GET_PSS_PERIPHERALS_STATUS' },
  { name: 'FcServiceMsg_req', action: 'GET_FC_SERVICE_MESSAGE' },
  { name: 'clear_FcServiceMsg_req', action: 'CLEAR_FC_SERVICE_MESSAGE' },
  { name: 'BackOfficeRecord_req', action: 'GET_BACK_OFFICE_RECORD' },
  {
    name: 'store_BackOfficeRecord_req',
    action: 'STORE_BACK_OFFICE_RECORD',
    payload: { borData: 'record' },
  },
  { name: 'clear_BackOfficeRecord_req', action: 'CLEAR_BACK_OFFICE_RECORD' },
  { name: 'ClientData_req', action: 'GET_CLIENT_DATA' },
  { name: 'store_ClientData_req', action: 'STORE_CLIENT_DATA' },
  {
    name: 'change_FpOperationModeSet_req',
    action: 'CHANGE_FP_OPERATION_MODE_SET',
    payload: {
      fpOperationModes: [
        {
          fpOperationModeNo: 1,
          fpOperationType: 0,
          fpServiceModes: [{ smId: 11, fmgId: 1, fcPriceGroupId: 1 }],
        },
      ],
    },
  },
  {
    name: 'TgData_req',
    action: 'GET_TG_DATA',
    payload: { tankDataItemId: [1] },
  },
  {
    name: 'change_DynamicTankData_req',
    action: 'CHANGE_DYNAMIC_TANK_DATA',
    payload: {
      dtdPars: {
        EnteredDensity: {
          DensityValue: '812',
          ExpireDateAndTime: '20260710120000',
          ScrollingSpeed: '00H',
          Text: 'builder coverage',
        },
      },
      requestedRole: 'administrator',
      reason: 'builder coverage',
    },
  },
  { name: 'TgErrorMsg_req', action: 'GET_TG_ERROR' },
  {
    name: 'change_WpOperationModeSet_req',
    action: 'CHANGE_WP_OPERATION_MODE_SET',
    payload: {
      wpOperationModes: [
        {
          wpOperationModeNo: 1,
          wpOperationType: 0,
          wpServiceModes: [{ wpSmId: 81, wpWmgId: 1, fcPriceGroupId: 1 }],
        },
      ],
    },
  },
  { name: 'open_Wp_req', action: 'OPEN_WP', payload: { wpOperationModeNo: 1 } },
  { name: 'close_Wp_req', action: 'CLOSE_WP' },
  { name: 'WpUnSupTrans_req', action: 'GET_WP_UNSUPERVISED_TRANSACTION' },
  {
    name: 'unlock_WpUnSupTrans_req',
    action: 'UNLOCK_WP_UNSUPERVISED_TRANSACTION',
  },
  {
    name: 'clear_WpUnSupTrans_req',
    action: 'CLEAR_WP_UNSUPERVISED_TRANSACTION',
  },
]

describe('DOMS/JPL command-builder registry coverage', () => {
  it('has exactly one executable fixture for every registered request name', () => {
    const fixtureNames = fixtures.map((fixture) => fixture.name).sort()
    const registeredNames = [...JPL_COMMAND_NAMES].sort()

    assert.equal(new Set(fixtureNames).size, fixtureNames.length)
    assert.deepEqual(fixtureNames, registeredNames)
  })

  for (const fixture of fixtures) {
    it(`builds ${fixture.name} through ${fixture.action}`, () => {
      const request = buildJplCommandRequest(
        fixture.action,
        withBase(fixture.payload),
      )

      assert.ok(request, `${fixture.action} should produce a request`)
      assert.equal(request.name, fixture.name)
      assert.ok(request.subCode, `${fixture.name} should include a subCode`)
      assert.ok(
        request.data && typeof request.data === 'object',
        `${fixture.name} should include a data object`,
      )
    })
  }

  it('returns null for an unsupported action', () => {
    assert.equal(buildJplCommandRequest('NOT_A_DOMS_COMMAND', {}), null)
  })

  it('includes delivery return bytes only on the start marker', () => {
    const starting = buildJplCommandRequest(
      'MARK_DELIVERY_STARTING',
      withBase({ deliveryReturnBytes: [1, '02H'] }),
    )
    const finished = buildJplCommandRequest(
      'MARK_DELIVERY_FINISHED',
      withBase({ deliveryReturnBytes: [1, '02H'] }),
    )

    assert.deepEqual(starting?.data?.DeliveryReturnBytes, ['01H', '02H'])
    assert.equal(finished?.data?.DeliveryReturnBytes, undefined)
  })
})

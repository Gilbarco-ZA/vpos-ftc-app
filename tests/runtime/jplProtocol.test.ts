import test from 'node:test'
import assert from 'node:assert/strict'

import * as DomsPosJpl from '@gilbarcoafs/doms-pos-jpl'

import {
  buildJplAccessCode,
  buildJplBootstrapConfig,
  normalizeJplPosId,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import {
  createCorrelationId,
  mapRejectEnvelope,
  normalizeJplInboundEnvelope,
  validateJplOutboundMessage,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import { buildJplCommandRequest } from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import { getJplGatewayState } from '@/src/platform/integrations/jpl/gateway'
import { setJplAdapterState, setJplBufferHealth } from '@/src/shared/forecourt/jplState'
import { unwrapMultiMessage } from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import {
  buildClearSupervisedTransactionRequest,
  buildClearUnsupervisedTransactionRequest,
  buildReadSupervisedTransactionRequest,
  buildReadUnsupervisedTransactionRequest,
  buildUnlockSupervisedTransactionRequest,
  buildUnlockUnsupervisedTransactionRequest,
  DEFAULT_TRANSACTION_PAR_IDS,
  extractTransactionCore,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'
import { markReplayCapability } from '@/src/modules/forecourt/infrastructure/jpl/replayState'
import {
  buildFpStatusSubCodePreference,
  derivePumpErrorGuidance,
  resolveDispenseAuthorizeMode,
} from '@/src/modules/forecourt/infrastructure/jpl/dispense'

const domsPosJpl = DomsPosJpl as any

test('normalizeJplPosId rejects reserved 00', () => {
  assert.throws(() => normalizeJplPosId('00'), /reserved/i)
  assert.equal(normalizeJplPosId('7'), '07')
})

test('buildJplAccessCode ensures RI and required price scheduling subscriptions', () => {
  const value = buildJplAccessCode({ baseAccessCode: 'POS', drSeconds: 9 })
  assert.match(value, /RI/)
  assert.match(value, /UNSO_FPSTA_3:MFDR=09/)
  assert.match(value, /UNSO_TRBUFSTA_3/)
  assert.match(value, /UNSO_PRISTA_1/)
})

test('buildJplBootstrapConfig normalizes posId and secure mode', () => {
  const bootstrap = buildJplBootstrapConfig({
    mode: 'jpl_tcp',
    jplOperationMode: 'unsupervised',
    jplHost: '127.0.0.1',
    jplPort: 8889,
    jplPosId: '4',
    jplAccessCode: 'POS',
    jplCountryCode: '1',
    jplPosVersionId: '470-02-1.08',
    jplUnsolicitedDrSeconds: 5,
    jplHeartbeatIntervalMs: 15000,
    jplDeadConnectionTimeoutMs: 30000,
    jplExpectedMinVersion: '470-02-1.07',
    jplUnsolicitedFlags: ['UNSO_TRBUFSTA_3'],
    jplUnsolicitedMfdrFlags: ['UNSO_FPSTA_3'],
    jplStatusUpdateCode: 3,
    jplBootstrapSnapshotEnabled: true,
    bufferWarnDepthSup: 2,
    bufferCritDepthSup: 5,
    bufferWarnAgeMinSup: 5,
    bufferCritAgeMinSup: 15,
    bufferWarnDepthUnsup: 1,
    bufferCritDepthUnsup: 3,
    bufferWarnAgeMinUnsup: 2,
    bufferCritAgeMinUnsup: 10,
  })

  assert.equal(bootstrap.posId, '04')
  assert.equal(bootstrap.secureMode, true)
  assert.equal(bootstrap.clientOptions.port, 8889)
  assert.match(bootstrap.logonOptions.accessCode, /RI/)
})

test('createCorrelationId produces a non-empty identifier', () => {
  assert.match(createCorrelationId(), /-/)
})

test('validateJplOutboundMessage validates supported requests', () => {
  const request = validateJplOutboundMessage({
    name: 'open_Fp_req',
    subCode: '00H',
    data: { FpId: '01', PosId: '02', FpOperationModeNo: 0 },
  })
  assert.equal(request.name, 'open_Fp_req')
})

test('buildJplCommandRequest returns validated finalize transaction request', () => {
  const request = buildJplCommandRequest('FINALIZE_TRANSACTION', {
    pumpNumber: 2,
    posId: 3,
    transSeqNo: 17,
    Money_e: '0000004321',
  })
  assert.equal(request?.name, 'clear_FpSupTrans_req')
  assert.equal(request?.data?.TransSeqNo, '0017')
})

test('buildJplCommandRequest delegates core status and fuelling envelopes to doms-pos-jpl builders', () => {
  const fpStatus = buildJplCommandRequest('GET_FP_STATUS', { pumpNumber: 2 })
  const expectedFpStatus = validateJplOutboundMessage(
    domsPosJpl.buildFpStatusEnvelope
      ? domsPosJpl.buildFpStatusEnvelope({ fpId: '02', variant: '03H' })
      : { name: 'FpStatus_req', subCode: '03H', data: { FpId: '02' } },
  )
  assert.deepEqual(fpStatus, expectedFpStatus)

  const fuellingData = buildJplCommandRequest('GET_FP_FUELLING_DATA', { fpId: 2 })
  const expectedFuellingData = validateJplOutboundMessage(
    domsPosJpl.buildFpFuellingDataEnvelope
      ? { ...domsPosJpl.buildFpFuellingDataEnvelope({ fpId: '02' }), subCode: '01H' }
      : { name: 'FpFuellingData_req', subCode: '01H', data: { FpId: '02' } },
  )
  assert.deepEqual(fuellingData, expectedFuellingData)
})

test('transaction builders delegate supervised transaction envelopes to doms-pos-jpl', () => {
  const readRequest = buildReadSupervisedTransactionRequest({
    fpId: 2,
    posId: 3,
    transSeqNo: 17,
  })
  const expectedRead = validateJplOutboundMessage(
    domsPosJpl.buildFpSupTransEnvelope
      ? domsPosJpl.buildFpSupTransEnvelope({
          fpId: '02',
          posId: '03',
          transSeqNo: '0017',
          transParIds: [...DEFAULT_TRANSACTION_PAR_IDS],
        })
      : {
          name: 'FpSupTrans_req',
          subCode: '00H',
          data: {
            FpId: '02',
            PosId: '03',
            TransSeqNo: '0017',
            TransParId: [...DEFAULT_TRANSACTION_PAR_IDS],
          },
        },
  )
  assert.deepEqual(readRequest, expectedRead)

  const unlockRequest = buildUnlockSupervisedTransactionRequest({
    fpId: 2,
    posId: 3,
    transSeqNo: 17,
  })
  const expectedUnlock = validateJplOutboundMessage(
    domsPosJpl.buildUnlockFpSupTransEnvelope
      ? domsPosJpl.buildUnlockFpSupTransEnvelope({
          fpId: '02',
          posId: '03',
          transSeqNo: '0017',
        })
      : {
          name: 'unlock_FpSupTrans_req',
          subCode: '00H',
          data: { FpId: '02', PosId: '03', TransSeqNo: '0017' },
        },
  )
  assert.deepEqual(unlockRequest, expectedUnlock)

  const clearRequest = buildClearSupervisedTransactionRequest({
    fpId: 2,
    posId: 3,
    transSeqNo: 17,
    payload: { Money_e: '0000004321' },
  })
  const expectedClear = validateJplOutboundMessage(
    domsPosJpl.buildClearFpSupTransEnvelope
      ? domsPosJpl.buildClearFpSupTransEnvelope({
          fpId: '02',
          posId: '03',
          transSeqNo: '0017',
          subCode: '04H',
          extraData: { Money_e: '0000004321' },
        })
      : {
          name: 'clear_FpSupTrans_req',
          subCode: '04H',
          data: {
            FpId: '02',
            PosId: '03',
            TransSeqNo: '0017',
            Money_e: '0000004321',
          },
        },
  )
  assert.deepEqual(clearRequest, expectedClear)
})

test('normalizeJplInboundEnvelope accepts reject envelopes and maps reject kinds', () => {
  const reject = normalizeJplInboundEnvelope({
    name: 'RejectMessage_resp',
    subCode: '01H',
    solicited: true,
    data: {
      RejectCode: { value: '02H' },
      RejectInfoText: 'Object does not contain a "subCode" property',
    },
  })
  const mapped = mapRejectEnvelope(reject)
  assert.equal(mapped.kind, 'syntax_error')
})

test('unwrapMultiMessage decodes lowercase messages arrays', () => {
  const messages = unwrapMultiMessage('MultiMessage_resp_00H', {
    messages: [
      {
        name: 'FpStatus_resp',
        subCode: '00H',
        data: { FpId: '01' },
      },
    ],
  })
  assert.equal(messages?.[0]?.__eventType, 'FpStatus_resp_00H')
})


test('buildJplBootstrapConfig uses configurable unsolicited flags and status update mode', () => {
  const bootstrap = buildJplBootstrapConfig({
    mode: 'jpl_tcp',
    jplOperationMode: 'unsupervised',
    jplHost: '127.0.0.1',
    jplPort: 8888,
    jplPosId: '5',
    jplAccessCode: 'POS',
    jplCountryCode: '1',
    jplPosVersionId: '470-02-1.08',
    jplUnsolicitedDrSeconds: 7,
    jplHeartbeatIntervalMs: 15000,
    jplDeadConnectionTimeoutMs: 30000,
    jplExpectedMinVersion: '470-02-1.07',
    jplUnsolicitedFlags: ['UNSO_INSTSTA_1', 'UNSO_TRBUFSTA_3'],
    jplUnsolicitedMfdrFlags: ['UNSO_FPSTA_3'],
    jplStatusUpdateCode: 3,
    jplBootstrapSnapshotEnabled: true,
    bufferWarnDepthSup: 2,
    bufferCritDepthSup: 5,
    bufferWarnAgeMinSup: 5,
    bufferCritAgeMinSup: 15,
    bufferWarnDepthUnsup: 1,
    bufferCritDepthUnsup: 3,
    bufferWarnAgeMinUnsup: 2,
    bufferCritAgeMinUnsup: 10,
  })

  assert.match(bootstrap.accessCode, /UNSO_INSTSTA_1/)
  assert.equal(bootstrap.statusUpdateCode, 3)
  assert.equal(bootstrap.bootstrapSnapshotEnabled, true)
})

test('validateJplOutboundMessage validates controller status and service log requests', () => {
  assert.equal(
    validateJplOutboundMessage({
      name: 'FcStatus_req',
      subCode: '00H',
      data: {},
    }).name,
    'FcStatus_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'clear_FcServiceMsg_req',
      subCode: '00H',
      data: { FcServiceMsgSeqNo: '12' },
    }).name,
    'clear_FcServiceMsg_req',
  )
})

test('validateJplOutboundMessage validates back office record requests', () => {
  assert.equal(
    validateJplOutboundMessage({
      name: 'BackOfficeRecord_req',
      subCode: '02H',
      data: {},
    }).name,
    'BackOfficeRecord_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'clear_BackOfficeRecord_req',
      subCode: '00H',
      data: { BorSeqNo: '12' },
    }).name,
    'clear_BackOfficeRecord_req',
  )
})

test('getJplGatewayState derives controller flags and diagnostics', () => {
  setJplAdapterState({
    connected: true,
    loggedOn: true,
    lastFcStatus: {
      FcStatus1Flags: { bits: { FallbackMode: 1, OpWithStoredTransDisabled: 32 } },
      FcStatus2Flags: { bits: { ServiceMsgReady: 1, BackOfficeRecordExists: 32, RtcError: 8 } },
    },
    lastPosConnectionStatus: {
      Connections: [
        {
          PosDeviceType: { enum: { Doms_POS_Protocol_Client: '01H' }, value: '01H' },
          ConnAddress: 12,
          ServerPortNo: 8888,
          ConnStatus: { bits: { online: 4 } },
        },
      ],
    },
    lastPssPeripheralsStatus: {
      Peripherals: [
        {
          PeripheralType: { enum: { Log_Printer: '02H' }, value: '02H' },
          ConnAddress: 3,
          ServerPortNo: 9100,
          PeripheralStatus: { bits: { is_online: 0, is_in_error_state: 32 } },
        },
      ],
    },
    lastBackOfficeRecords: [
      { seqNo: '12', formatId: '51', subCode: '02H', payload: { BorData: 'abc' }, at: Date.now() },
    ],
  })

  const state = getJplGatewayState()
  assert.equal(state.controllerFlags?.serviceMessageReady, true)
  assert.equal(state.controllerFlags?.backOfficeRecordExists, true)
  assert.equal(state.controllerFlags?.fallbackMode, true)
  assert.equal(state.onlinePeerConnections?.[0]?.deviceType, 'Doms_POS_Protocol_Client')
  assert.equal(state.peripheralAlerts?.[0]?.peripheralType, 'Log_Printer')
  assert.equal(state.backOfficeRecords?.[0]?.seqNo, '12')
})

test('getJplGatewayState exposes protocol capability and protocol health state', () => {
  const previousClient = (globalThis as any).__jplTcpClient
  ;(globalThis as any).__jplTcpClient = {
    getServerJplVersion: () => '470-02-1.08',
    getServerSupportsCorrelationIds: () => true,
    requestDispatcher: {
      getDispatchMode: () => 'correlated-concurrent',
    },
    listenerCount: (eventName: string) => (eventName === 'rawFrame' ? 1 : 0),
  }

  setJplAdapterState({
    connected: true,
    loggedOn: true,
    secureMode: true,
    welcomeVersion: '470-02-1.08',
    lastReject: {
      code: '01H',
      kind: 'pss',
      info: 'Rejected for test',
      correlationId: 'abc-123',
      at: Date.now(),
    },
  })

  const state = getJplGatewayState()
  assert.equal(state.protocol?.version, '470-02-1.08')
  assert.equal(state.protocol?.correlationSupport, true)
  assert.equal(state.protocol?.requestDispatchMode, 'correlated-concurrent')
  assert.equal(state.protocol?.requestMode, 'correlated')
  assert.equal(state.protocol?.secureMode, true)
  assert.equal(state.protocol?.lastReject?.correlationId, 'abc-123')
  assert.deepEqual(state.protocol?.defaultSubscriptions?.unsolicitedFlags, [
    'UNSO_INSTSTA_1',
    'UNSO_TRBUFSTA_3',
    'UNSO_TGSTA_1',
    'UNSO_DELIVSTA_1',
    'UNSO_PRISTA_1',
  ])
  assert.deepEqual(state.protocol?.defaultSubscriptions?.unsolicitedMfdrFlags, [
    'UNSO_FPSTA_3',
  ])
  assert.equal(state.protocol?.rawFrameDiagnosticsEnabled, true)
  assert.equal(state.protocolHealth?.protocolVersion, '470-02-1.08')
  assert.equal(state.protocolHealth?.correlationSupported, true)
  assert.equal(state.protocolHealth?.requestMode, 'correlated')
  assert.equal(state.protocolHealth?.secureTransport, true)
  assert.equal(state.protocolHealth?.lastReject?.correlationId, 'abc-123')
  assert.equal(state.protocolHealth?.rawFrameDiagnosticsEnabled, true)
  assert.equal(state.protocolHealth?.status, 'degraded')
  assert.equal(state.protocolHealth?.issues?.some((issue: any) => issue.code === 'recent-reject'), true)
  assert.equal(state.correlationSupport, true)
  assert.equal(state.requestMode, 'correlated')

  ;(globalThis as any).__jplTcpClient = previousClient ?? null
})

test('validateJplOutboundMessage validates pump and delivery status request families', () => {
  assert.equal(
    validateJplOutboundMessage({
      name: 'FpStatus_req',
      subCode: '03H',
      data: { FpId: '01' },
    }).name,
    'FpStatus_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'FpInfo_req',
      subCode: '01H',
      data: { FpId: '01', FpInfoParId: ['02'] },
    }).name,
    'FpInfo_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'FpFuellingData_req',
      subCode: '01H',
      data: { FpId: '01' },
    }).name,
    'FpFuellingData_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'SiteDeliveryStatus_req',
      subCode: '01H',
      data: {},
    }).name,
    'SiteDeliveryStatus_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'clear_TankDeliveryData_req',
      subCode: '00H',
      data: {
        PosId: '01',
        DeliveryReportSeqNo: '12',
        TankDeliveries: [{ TgId: '01', TankDeliverySeqNo: '02' }],
      },
    }).name,
    'clear_TankDeliveryData_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'open_TankController_req',
      subCode: '00H',
      data: { TankId: '01', PosId: '01', TankOperationModeNo: 0 },
    }).name,
    'open_TankController_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'start_DeliveryProcess_req',
      subCode: '00H',
      data: {
        TankId: '01',
        PosId: '01',
        FcProductId: '02',
        StartDeliveryProcessPars: { TankControlSmId: '81', FcProductName: 'Diesel' },
      },
    }).name,
    'start_DeliveryProcess_req',
  )
})



test('buildJplCommandRequest builds wetstock control commands', () => {
  const openTank = buildJplCommandRequest('OPEN_TANK_CONTROLLER', {
    tankId: 4,
    posId: 3,
    tankOperationModeNo: 0,
  })
  assert.equal(openTank?.name, 'open_TankController_req')
  assert.equal(openTank?.data?.TankId, '04')
  assert.equal(openTank?.data?.PosId, '03')

  const startDelivery = buildJplCommandRequest('START_DELIVERY_PROCESS', {
    tankId: 4,
    posId: 3,
    fcProductId: 2,
    startDeliveryProcessPars: { TankControlSmId: '81', FcProductName: 'Diesel' },
  })
  assert.equal(startDelivery?.name, 'start_DeliveryProcess_req')
  assert.equal(startDelivery?.data?.TankId, '04')
  assert.equal(startDelivery?.data?.FcProductId, '02')

  const stopDelivery = buildJplCommandRequest('STOP_DELIVERY_PROCESS', {
    tankId: 4,
    posId: 0,
  })
  assert.equal(stopDelivery?.name, 'stop_DeliveryProcess_req')
  assert.equal(stopDelivery?.data?.PosId, '00')
})
test('buildJplCommandRequest builds preset authorize and pump reads', () => {
  const preset = buildJplCommandRequest('PRESET_FUEL_AUTH', {
    pumpNumber: 3,
    posId: 4,
    moneyPresetLimit: '000123',
  })
  assert.equal(preset?.name, 'authorize_Fp_req')
  assert.equal(preset?.subCode, '01H')
  assert.equal(preset?.data?.FpId, '03')

  const fpStatus = buildJplCommandRequest('GET_FP_STATUS', { pumpNumber: 2 })
  assert.equal(fpStatus?.name, 'FpStatus_req')
  assert.equal(fpStatus?.subCode, '03H')

  const fpInfo = buildJplCommandRequest('GET_FP_INFO', { fpId: 2, fpInfoParId: ['02'] })
  assert.equal(fpInfo?.name, 'FpInfo_req')
  assert.equal(fpInfo?.subCode, '01H')

  const fuellingData = buildJplCommandRequest('GET_FP_FUELLING_DATA', { fpId: 2 })
  assert.equal(fuellingData?.name, 'FpFuellingData_req')
  assert.equal(fuellingData?.subCode, '01H')
})

test('getJplGatewayState derives active pump and tank summaries', () => {
  setJplAdapterState({
    lastFpStatuses: [
      {
        fpId: '01',
        subCode: '03H',
        normalized: {
          fpId: '01',
          mainState: 'Fuelling',
          nozzleState: 'fuelling',
          flags: { isOnline: true, isLockedByPos: true },
          lockId: '04',
          gradeId: '02',
          nozzleNumber: 1,
        },
        payload: {},
        at: Date.now(),
      },
    ],
    lastTgStatuses: [
      {
        tgId: '09',
        subCode: '01H',
        normalized: {
          tgId: '09',
          mainState: 'Alarm',
          flags: { deliveryInProgress: true },
          alarms: { highLevelAlarm: true },
        },
        payload: {},
        at: Date.now(),
      },
    ],
  })

  const state = getJplGatewayState()
  assert.equal(state.activePumpStatuses?.[0]?.mainState, 'Fuelling')
  assert.equal(state.activePumpStatuses?.[0]?.lockId, '04')
  assert.equal(state.tankAlerts?.[0]?.mainState, 'Alarm')
  assert.equal(state.tankAlerts?.[0]?.alarms?.highLevelAlarm, true)
})


test('buildJplCommandRequest returns validated extended authorize request', () => {
  const request = buildJplCommandRequest('EXTENDED_FUEL_AUTH', {
    pumpNumber: 3,
    posId: 4,
    AuthorizePars: {
      SmId: '21',
      ValidGrades: ['01'],
      StartLimit_e: {
        StartLimitType_e: '02H',
        MoneyPresetLimit_e: '0000002500',
      },
      AutoLockId: '04',
    },
  })

  assert.equal(request?.name, 'authorize_Fp_req')
  assert.equal(request?.subCode, '02H')
  assert.equal(request?.data?.FpId, '03')
  assert.equal(request?.data?.PosId, '04')
  assert.equal(request?.data?.AuthorizePars?.SmId, '21')
})


test('buildJplCommandRequest returns validated prepare transaction request', () => {
  const request = buildJplCommandRequest('PREPARE_TRANSACTION', {
    pumpNumber: 6,
    posId: 8,
    SmId: '21',
    ValidGrades: ['02'],
    StartLimit_e: {
      StartLimitType_e: '02H',
      MoneyPresetLimit_e: '0000005000',
    },
  })

  assert.equal(request?.name, 'prepare_Trans_req')
  assert.equal(request?.subCode, '01H')
  assert.equal(request?.data?.FpId, '06')
  assert.equal(request?.data?.PosId, '08')
  assert.equal(request?.data?.AuthorizePars?.SmId, '21')
})


test('getJplGatewayState derives buffer health summaries and alerts', () => {
  setJplBufferHealth({
    updatedAt: Date.now(),
    supervised: {
      '1': {
        pumpId: 1,
        depth: 6,
        lastSeqNo: 44,
        lastStatusAt: Date.now() - 20 * 60 * 1000,
        lastReadAt: null,
        lastClearAt: null,
      },
    },
    unsupervised: {
      '2': {
        pumpId: 2,
        depth: 1,
        lastSeqNo: 4,
        lastStatusAt: Date.now() - 30 * 1000,
        lastReadAt: null,
        lastClearAt: null,
      },
    },
  })

  const state = getJplGatewayState()
  assert.equal(state.bufferHealth?.totals.supervisedDepth, 6)
  assert.equal(state.bufferHealth?.totals.unsupervisedDepth, 1)
  assert.equal(state.bufferAlerts?.[0]?.mode, 'supervised')
  assert.equal(state.bufferAlerts?.[0]?.pumpId, 1)
  assert.equal(state.bufferAlerts?.[0]?.severity, 'critical')
})


test('validateJplOutboundMessage validates estop reset and pump error requests', () => {
  assert.equal(
    validateJplOutboundMessage({
      name: 'estop_Fp_req',
      subCode: '00H',
      data: { FpId: '01', PosId: '02' },
    }).name,
    'estop_Fp_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'cancel_FpEstop_req',
      subCode: '00H',
      data: { FpId: '01', PosId: '02' },
    }).name,
    'cancel_FpEstop_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'reset_Fp_req',
      subCode: '00H',
      data: { FpId: '01' },
    }).name,
    'reset_Fp_req',
  )

  assert.equal(
    validateJplOutboundMessage({
      name: 'FpErrorMsg_req',
      subCode: '00H',
      data: { FpId: '01' },
    }).name,
    'FpErrorMsg_req',
  )
})

test('buildJplCommandRequest builds estop reset and pump error commands', () => {
  const estop = buildJplCommandRequest('ESTOP_FP', { pumpNumber: 7, posId: 4 })
  assert.equal(estop?.name, 'estop_Fp_req')
  assert.equal(estop?.data?.FpId, '07')

  const cancelEstop = buildJplCommandRequest('CANCEL_FP_ESTOP', { pumpNumber: 7, posId: 4 })
  assert.equal(cancelEstop?.name, 'cancel_FpEstop_req')
  assert.equal(cancelEstop?.data?.FpId, '07')

  const reset = buildJplCommandRequest('RESET_FP', { pumpNumber: 7 })
  assert.equal(reset?.name, 'reset_Fp_req')
  assert.equal(reset?.data?.FpId, '07')

  const fpError = buildJplCommandRequest('GET_FP_ERROR', { pumpNumber: 7 })
  assert.equal(fpError?.name, 'FpErrorMsg_req')
  assert.equal(fpError?.data?.FpId, '07')
})

test('getJplGatewayState derives pump error diagnostics', () => {
  setJplAdapterState({
    lastFpErrors: [
      {
        fpId: '07',
        subCode: '00H',
        normalized: {
          fpId: '07',
          errorCode: '24',
          errorName: 'Sub_Pump_error',
          errorDateAndTime: '20260410120000',
          pumpProtocolId: '12',
          pumpErrorCode: 'SP01 1',
          severity: 'error',
        },
        payload: {},
        at: Date.now(),
      },
    ],
  })

  const state = getJplGatewayState()
  assert.equal(state.fpErrors?.[0]?.fpId, '07')
  assert.equal(state.pumpErrorDiagnostics?.[0]?.errorName, 'Sub_Pump_error')
  assert.equal(state.pumpErrorDiagnostics?.[0]?.pumpErrorCode, 'SP01 1')
})


test('transaction service builds supervised transaction command family', () => {
  const readReq = buildReadSupervisedTransactionRequest({
    fpId: 1,
    posId: '00',
    transSeqNo: 27,
  })
  assert.equal(readReq.name, 'FpSupTrans_req')
  assert.equal(readReq.data.PosId, '00')
  assert.equal(readReq.data.TransSeqNo, '0027')

  const unlockReq = buildUnlockSupervisedTransactionRequest({
    fpId: 1,
    posId: '00',
    transSeqNo: 27,
  })
  assert.equal(unlockReq.name, 'unlock_FpSupTrans_req')
  assert.equal(unlockReq.data.PosId, '00')

  const clearReq = buildClearSupervisedTransactionRequest({
    fpId: 1,
    posId: 4,
    transSeqNo: 27,
    txData: {
      data: {
        FpId: '01',
        TransSeqNo: '0027',
        TransPars: { Vol_e: '0000001234', Money_e: '0000005678' },
      },
    },
  })
  assert.equal(clearReq.name, 'clear_FpSupTrans_req')
  assert.equal(clearReq.subCode, '04H')
  assert.equal(clearReq.data.Vol_e, '0000001234')
})

test('transaction service builds unsupervised transaction command family', () => {
  const readReq = buildReadUnsupervisedTransactionRequest({
    fpId: 2,
    posId: '00',
    transSeqNo: 31,
  })
  assert.equal(readReq.name, 'FpUnSupTrans_req')
  assert.equal(readReq.data.PosId, '00')

  const unlockReq = buildUnlockUnsupervisedTransactionRequest({
    fpId: 2,
    posId: '00',
    transSeqNo: 31,
  })
  assert.equal(unlockReq.name, 'unlock_FpUnSupTrans_req')

  const clearReq = buildClearUnsupervisedTransactionRequest({
    fpId: 2,
    posId: 4,
    transSeqNo: 31,
    txData: {
      data: {
        FpId: '02',
        TransSeqNo: '0031',
        TransPars: { Vol_e: '0000002222', Money_e: '0000009999' },
      },
    },
    payload: {
      EptReceiptFormatId: '12',
      EptReceiptItems: { SelectedDeviceId: '02', ReceiptNo: '1234' },
    },
  })
  assert.equal(clearReq.name, 'clear_FpUnSupTrans_req')
  assert.equal(clearReq.subCode, '03H')
  assert.equal(clearReq.data.EptReceiptFormatId, '12')
})

test('extractTransactionCore pulls identifiers from nested responses', () => {
  const core = extractTransactionCore({
    data: {
      FpId: '03',
      TransSeqNo: '0042',
      TransPars: { Money_e: '0000001000' },
    },
  })
  assert.equal(core.fpId, '03')
  assert.equal(core.transSeqNo, '0042')
})

test('getJplGatewayState exposes replay capabilities', () => {
  markReplayCapability('supervised', 'allowed')
  markReplayCapability('unsupervised', 'denied')
  const state = getJplGatewayState()
  assert.equal(state.replayCapabilities?.supervised, 'allowed')
  assert.equal(state.replayCapabilities?.unsupervised, 'denied')
})


test('transaction service keeps supervised clear explicit and read-derived', () => {
  const withoutRead = buildClearSupervisedTransactionRequest({
    fpId: 1,
    posId: 4,
    transSeqNo: 27,
  })
  assert.equal(withoutRead.name, 'clear_FpSupTrans_req')
  assert.equal(withoutRead.subCode, '00H')
  assert.equal(Object.prototype.hasOwnProperty.call(withoutRead.data, 'Vol_e'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(withoutRead.data, 'Money_e'), false)

  const readResult = {
    data: {
      FpId: '01',
      PosId: '04',
      TransSeqNo: '0027',
      TransPars: {
        Vol_e: '0000001234',
        Money_e: '0000005678',
      },
    },
  }

  const withRead = buildClearSupervisedTransactionRequest({
    fpId: 1,
    posId: 4,
    transSeqNo: 27,
    txData: readResult,
  })
  assert.equal(withRead.name, 'clear_FpSupTrans_req')
  assert.equal(withRead.subCode, '04H')
  assert.equal(withRead.data.Vol_e, '0000001234')
  assert.equal(withRead.data.Money_e, '0000005678')
})

test('getJplGatewayState keeps last reject and protocol health in sync', () => {
  const previousClient = (globalThis as any).__jplTcpClient
  ;(globalThis as any).__jplTcpClient = {
    getServerJplVersion: () => '470-02-1.05',
    getServerSupportsCorrelationIds: () => false,
    requestDispatcher: {
      getDispatchMode: () => 'strict-single-flight',
    },
    listenerCount: () => 0,
  }

  setJplAdapterState({
    connected: true,
    loggedOn: true,
    secureMode: false,
    welcomeVersion: '470-02-1.05',
    lastReject: {
      code: '02H',
      kind: 'syntax_error',
      info: 'Bad subCode',
      correlationId: undefined,
      at: Date.now(),
    },
  })

  const state = getJplGatewayState()
  assert.equal(state.protocol?.lastReject?.info, 'Bad subCode')
  assert.equal(state.protocolHealth?.lastReject?.kind, 'syntax_error')
  assert.equal(state.protocolHealth?.correlationSupported, false)
  assert.equal(state.protocolHealth?.requestMode, 'single-flight-fallback')

  ;(globalThis as any).__jplTcpClient = previousClient
})


test('dispense helpers classify authorize flows and fp status fallback order', () => {
  assert.equal(resolveDispenseAuthorizeMode('AUTHORIZE_FP', {}), 'standard')
  assert.equal(
    resolveDispenseAuthorizeMode('PRESET_FUEL_AUTH', { moneyPresetLimit: '100' }),
    'preset',
  )
  assert.equal(
    resolveDispenseAuthorizeMode('EXTENDED_FUEL_AUTH', {
      AuthorizePars: { SmId: '21' },
    }),
    'extended',
  )
  assert.equal(
    resolveDispenseAuthorizeMode('PREPARE_TRANSACTION', {
      StartLimit_e: { StartLimitType_e: '02H' },
    }),
    'prepare_transaction',
  )
  assert.deepEqual(buildFpStatusSubCodePreference('02H'), ['02H', '03H', '01H', '00H'])
})

test('pump error guidance derives tank and communication categories', () => {
  const tank = derivePumpErrorGuidance({
    errorCode: '49',
    errorName: 'Delivery_alarm',
    pumpErrorCode: 'DLV01',
    severity: 'warning',
  })
  assert.equal(tank.category, 'tank_or_delivery')
  assert.equal(tank.needsAdminIntervention, true)

  const comms = derivePumpErrorGuidance({
    errorCode: '24',
    errorName: 'Pump_offline',
    pumpErrorCode: 'COMM 01',
    severity: 'error',
  })
  assert.equal(comms.category, 'communication')
})

test('validateJplOutboundMessage validates optional module request families', () => {
  for (const request of [
    { name: 'PpStatus_req', subCode: '00H', data: { PpId: '01' } },
    { name: 'open_Pp_req', subCode: '00H', data: { PpId: '01', PosId: '02', PpOperationModeNo: 0 } },
    { name: 'WpStatus_req', subCode: '00H', data: { WpId: '03' } },
    { name: 'authorize_Wp_req', subCode: '00H', data: { WpId: '03', PosId: '02', AuthorizePars: { WpValidWashPrograms: ['01'] } } },
    { name: 'DiopStatus_req', subCode: '00H', data: { DiopId: '04' } },
    { name: 'change_DiopOutput_req', subCode: '00H', data: { DiopId: '04', DiopControl: '01H' } },
    { name: 'SensorStatus_req', subCode: '00H', data: { SensorId: '05' } },
    { name: 'VmStatus_req', subCode: '00H', data: { VmId: '06' } },
    { name: 'clear_InstallData_req', subCode: '01H', data: { ExtendedInstallMsgCode: '0201H', FcDeviceId: '00' } },
  ]) {
    assert.equal(validateJplOutboundMessage(request).name, request.name)
  }
})

test('buildJplCommandRequest builds optional module commands', () => {
  assert.equal(buildJplCommandRequest('GET_PP_STATUS', { ppId: 1 })?.name, 'PpStatus_req')
  assert.equal(buildJplCommandRequest('OPEN_PP', { ppId: 1, posId: 2 })?.data?.PpId, '01')
  assert.equal(buildJplCommandRequest('GET_WP_STATUS', { wpId: 3 })?.name, 'WpStatus_req')
  assert.equal(buildJplCommandRequest('AUTHORIZE_WP', { wpId: 3, posId: 2, WpValidWashPrograms: ['01'] })?.data?.AuthorizePars?.WpValidWashPrograms?.[0], '01')
  assert.equal(buildJplCommandRequest('CHANGE_DIOP_OUTPUT', { diopId: 4, outputCode: '01H' })?.data?.DiopControl, '01H')
  assert.equal(buildJplCommandRequest('GET_SENSOR_STATUS', { sensorId: 5 })?.name, 'SensorStatus_req')
  assert.equal(buildJplCommandRequest('GET_VM_STATUS', { vmId: 6 })?.name, 'VmStatus_req')
  assert.equal(buildJplCommandRequest('CLEAR_SERIAL_SERVER_INSTALLATION', { serialServerId: 0 })?.data?.ExtendedInstallMsgCode, '0201H')
})


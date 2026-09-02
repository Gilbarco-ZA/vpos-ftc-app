import * as DomsPosJpl from '@gilbarcoafs/doms-pos-jpl'

import { padId2 } from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import {
  buildFpStatusSubCodePreference,
  resolveDispenseAuthorizeMode,
} from '@/src/modules/forecourt/infrastructure/jpl/dispense'
import {
  buildJplDispenseAuthorizationEnvelope,
  resolveDispenseAuthorizationOperation,
} from '@/src/modules/forecourt/infrastructure/jpl/dispenseAuthorization'
import { normalizeDomsDynamicTankDataRequest } from '@/src/modules/forecourt/infrastructure/jpl/dynamicTankData'
import { normalizeJplPosId } from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import { validateJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import {
  JPL_FC_DATE_TIME_ZERO,
  JPL_ID_ZERO,
  normalizeJplCode1,
  normalizeJplCode2,
  normalizeJplDec2,
  normalizeJplDec2OrZero,
  normalizeJplDec4,
  normalizeJplDec6,
  normalizeJplFcDateTime,
  normalizeJplId2,
  normalizeJplId2List,
  normalizeJplId2OrZero,
  normalizeJplPriceMatrix,
  normalizeJplPriceSetType,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/types'
import {
  buildClearSupervisedTransactionRequest,
  buildReadSupervisedTransactionRequest,
  buildUnlockSupervisedTransactionRequest,
  DEFAULT_TRANSACTION_PAR_IDS,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'
import { getForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export const JPL_COMMAND_NAMES = [
  'open_Fp_req',
  'close_Fp_req',
  'authorize_Fp_req',
  'prepare_Trans_req',
  'cancel_FpAuth_req',
  'clear_FpError_req',
  'FpSupTrans_req',
  'unlock_FpSupTrans_req',
  'clear_FpSupTrans_req',
  'FpUnSupTrans_req',
  'unlock_FpUnSupTrans_req',
  'clear_FpUnSupTrans_req',
  'FpStatus_req',
  'FpInfo_req',
  'FpFuellingData_req',
  'FpErrorMsg_req',
  'FpGradeTotals_req',
  'PumpGradeTotals_req',
  'PumpGradeBlendTotals_req',
  'FbTotals_req',
  'clear_FallbackTotals_req',
  'estop_Fp_req',
  'cancel_FpEstop_req',
  'reset_Fp_req',
  'TgStatus_req',
  'open_TankController_req',
  'close_TankController_req',
  'TankControlStatus_req',
  'block_Tank_req',
  'unblock_Tank_req',
  'start_DeliveryProcess_req',
  'stop_DeliveryProcess_req',
  'mark_DeliveryStarting_req',
  'mark_DeliveryFinished_req',
  'SiteDeliveryStatus_req',
  'TankDeliveryData_req',
  'clear_TankDeliveryData_req',
  'clear_InstallData_req',
  'PpStatus_req',
  'open_Pp_req',
  'close_Pp_req',
  'PpErrorMsg_req',
  'clear_PpError_req',
  'reset_Pp_req',
  'WpStatus_req',
  'prepare_WpAuth_req',
  'authorize_Wp_req',
  'cancel_WpAuth_req',
  'stop_Wp_req',
  'cancel_WpStop_req',
  'WpErrorMsg_req',
  'clear_WpError_req',
  'reset_Wp_req',
  'clear_TgError_req',
  'reset_Tg_req',
  'FcDateAndTime_req',
  'change_FcDateAndTime_req',
  'FcOperationModeStatus_req',
  'change_FcOperationModeNo_req',
  'UtilEcho_req',
  'DiopStatus_req',
  'change_DiopOutput_req',
  'SensorStatus_req',
  'VmStatus_req',
  'open_Vm_req',
  'close_Vm_req',
  'VmDrystockTotals_req',
  'VmErrorMsg_req',
  'clear_VmError_req',
  'reset_Vm_req',
  'FcPriceSetStatus_req',
  'FcPriceSet_req',
  'change_FcPriceSet_req',
  'clear_PendingFcPriceSet_req',
  'change_FcStatusUpdateMode_req',
  'FcStatus_req',
  'FcInstallStatus_req',
  'PosConnectionStatus_req',
  'PssPeripheralsStatus_req',
  'FcServiceMsg_req',
  'clear_FcServiceMsg_req',
  'BackOfficeRecord_req',
  'store_BackOfficeRecord_req',
  'clear_BackOfficeRecord_req',
  'ClientData_req',
  'store_ClientData_req',
  'change_FpOperationModeSet_req',
  'TgData_req',
  'change_DynamicTankData_req',
  'TgErrorMsg_req',
  'change_WpOperationModeSet_req',
  'open_Wp_req',
  'close_Wp_req',
  'WpUnSupTrans_req',
  'unlock_WpUnSupTrans_req',
  'clear_WpUnSupTrans_req',
] as const

export type JplCommandName = (typeof JPL_COMMAND_NAMES)[number]

export type JplCommandRequest = {
  name: JplCommandName | string
  subCode?: string
  data?: Record<string, any>
  [key: string]: any
}

const buildFpStatusEnvelope = (DomsPosJpl as any).buildFpStatusEnvelope as
  | ((input: { fpId: string; variant?: string }) => any)
  | undefined

const buildFpFuellingDataEnvelope = (DomsPosJpl as any)
  .buildFpFuellingDataEnvelope as ((input: { fpId: string }) => any) | undefined

const EXTENDED_INSTALL_MESSAGE_CODES = {
  fuellingPoint: '0010H',
  pricePole: '0037H',
  tankGauge: '0040H',
  electronicPaymentTerminal: '0050H',
  vapourRecoveryController: '002AH',
  washPoint: '0101H',
  serialServer: '0201H',
  externalTerminalSubDevice: '0301H',
  digitalIoPin: '0401H',
  dispenser: '0710H',
  vendingMachine: '0C01H',
} as const

const ALL_TANK_DELIVERY_ITEM_IDS = Array.from({ length: 29 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)

const ALL_TANK_DATA_ITEM_IDS = [
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
]

const normalizeCode1 = normalizeJplCode1
const normalizeCode2 = normalizeJplCode2

const buildWashAuthorizeParsPayload = (payload: any) => {
  const nested = payload?.AuthorizePars ?? payload?.authorizePars
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested
  }

  const authorizePars = cleanObject({
    WpValidWashPrograms: normalizeId2List(
      payload?.WpValidWashPrograms ?? payload?.wpValidWashPrograms,
    ),
    WpStartLimit: payload?.WpStartLimit ?? payload?.wpStartLimit,
    WpTransReturnData: maybeArray(
      payload?.WpTransReturnData ?? payload?.wpTransReturnData,
    ),
    WpLogData: payload?.WpLogData ?? payload?.wpLogData,
    WpTransReturnData2: maybeArray(
      payload?.WpTransReturnData2 ?? payload?.wpTransReturnData2,
    ),
    WpWashOptions: maybeArray(payload?.WpWashOptions ?? payload?.wpWashOptions),
  })

  return Object.keys(authorizePars).length ? authorizePars : undefined
}

export const normalizeJplCommandAction = (action: string) =>
  String(action ?? '')
    .trim()
    .toUpperCase()

const maybeArray = <T = any>(value: unknown): T[] | undefined =>
  Array.isArray(value) ? (value as T[]) : undefined

const cleanObject = (value: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )

const normalizeId2List = (value: unknown) => normalizeJplId2List(value)

const normalizeDec2OrZero = normalizeJplDec2OrZero
const normalizeId2OrZero = normalizeJplId2OrZero
const normalizeDec2 = normalizeJplDec2

const toNonNegativeInt = (value: unknown, fallback = 0) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.trunc(parsed)
}

const toDec4 = (value: unknown, fallback = '0') =>
  normalizeJplDec4(value, fallback)

const normalizeByteList = (value: unknown) =>
  maybeArray(value)
    ?.map((entry) => normalizeCode1(entry))
    .filter(Boolean)

const normalizeFpOperationModes = (value: unknown) =>
  maybeArray<Record<string, any>>(value)
    ?.map((mode) =>
      cleanObject({
        FpOperationModeNo: toNonNegativeInt(
          mode?.FpOperationModeNo ?? mode?.fpOperationModeNo,
        ),
        FpOperationType: toNonNegativeInt(
          mode?.FpOperationType ?? mode?.fpOperationType,
        ),
        FpServiceModes: maybeArray<Record<string, any>>(
          mode?.FpServiceModes ?? mode?.fpServiceModes,
        )
          ?.map((service) =>
            cleanObject({
              SmId: normalizeJplId2(service?.SmId ?? service?.smId),
              FmgId: normalizeJplId2(service?.FmgId ?? service?.fmgId),
              FcPriceGroupId: normalizeJplId2(
                service?.FcPriceGroupId ?? service?.fcPriceGroupId,
              ),
            }),
          )
          .filter((service) => service.SmId && service.FmgId),
      }),
    )
    .filter(
      (mode) =>
        Array.isArray(mode.FpServiceModes) && mode.FpServiceModes.length > 0,
    )

const normalizeWpOperationModes = (value: unknown) =>
  maybeArray<Record<string, any>>(value)
    ?.map((mode) =>
      cleanObject({
        WpOperationModeNo: toNonNegativeInt(
          mode?.WpOperationModeNo ?? mode?.wpOperationModeNo,
        ),
        WpOperationType: toNonNegativeInt(
          mode?.WpOperationType ?? mode?.wpOperationType,
        ),
        WpServiceModes: maybeArray<Record<string, any>>(
          mode?.WpServiceModes ?? mode?.wpServiceModes,
        )
          ?.map((service) =>
            cleanObject({
              WpSmId: normalizeJplId2(service?.WpSmId ?? service?.wpSmId),
              WpWmgId: normalizeJplId2(service?.WpWmgId ?? service?.wpWmgId),
              FcPriceGroupId: normalizeJplId2(
                service?.FcPriceGroupId ?? service?.fcPriceGroupId,
              ),
            }),
          )
          .filter((service) => service.WpSmId && service.WpWmgId),
      }),
    )
    .filter(
      (mode) =>
        Array.isArray(mode.WpServiceModes) && mode.WpServiceModes.length > 0,
    )

const buildEmptyDataRequest = (name: JplCommandName, subCode = '00H') =>
  validateJplOutboundMessage({ name, subCode, data: {} })

const normalizeTankDeliveries = (value: unknown) =>
  maybeArray<Record<string, unknown>>(value)
    ?.map((entry) =>
      cleanObject({
        TgId: padId2(entry?.TgId ?? entry?.tgId ?? entry?.tankId),
        TankDeliverySeqNo: padId2(
          entry?.TankDeliverySeqNo ?? entry?.tankDeliverySeqNo,
        ),
      }),
    )
    .filter((entry) => entry.TgId && entry.TankDeliverySeqNo)

export const describeJplAuthorizeRequest = (
  action: string,
  payload: Record<string, unknown> | null | undefined,
) => ({
  authorizeMode: resolveDispenseAuthorizeMode(action, payload ?? undefined),
})

const buildPriceSetStatusRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'FcPriceSetStatus_req' as JplCommandName,
    subCode: normalizeCode1(payload?.subCode ?? payload?.SubCode ?? '01H'),
    data: {},
  })

const buildReadPriceSetRequest = (payload: any) => {
  const subCode = normalizeCode1(payload?.subCode ?? payload?.SubCode ?? '04H')
  const priceSetType = normalizeJplPriceSetType(
    payload?.priceSetType ?? payload?.PriceSetType,
    subCode === '04H' ? '00H' : '00H',
  )

  const request: JplCommandRequest = {
    name: 'FcPriceSet_req' as JplCommandName,
    subCode,
    data: {
      PriceSetType: priceSetType,
    },
  }

  if (subCode === '04H') {
    request.data = {
      ...request.data,
      FcPriceSetId:
        priceSetType === '00H'
          ? JPL_ID_ZERO
          : padId2(
              payload?.fcPriceSetId ??
                payload?.FcPriceSetId ??
                payload?.priceSetId,
            ),
      PriceSetActivationDateAndTime:
        priceSetType === '00H'
          ? JPL_FC_DATE_TIME_ZERO
          : normalizeJplFcDateTime(
              payload?.priceSetActivationDateAndTime ??
                payload?.PriceSetActivationDateAndTime ??
                payload?.activationAt,
            ),
    }
  }

  return validateJplOutboundMessage(request)
}

const buildChangePriceSetRequest = (payload: any) => {
  const subCode = normalizeCode1(payload?.subCode ?? payload?.SubCode ?? '04H')
  const request: JplCommandRequest = {
    name: 'change_FcPriceSet_req' as JplCommandName,
    subCode,
    data: cleanObject({
      UserId:
        subCode === '02H'
          ? undefined
          : String(payload?.userId ?? payload?.UserId ?? '').trim(),
      FcPriceSetId: padId2(
        payload?.fcPriceSetId ?? payload?.FcPriceSetId ?? payload?.priceSetId,
      ),
      FcPriceGroupId: normalizeId2List(
        payload?.fcPriceGroupIds ??
          payload?.FcPriceGroupId ??
          payload?.fcPriceGroupId,
      ),
      FcGradeId: normalizeId2List(
        payload?.fcGradeIds ?? payload?.FcGradeId ?? payload?.fcGradeId,
      ),
      FcPriceGroups: normalizeJplPriceMatrix(
        payload?.fcPriceGroups ?? payload?.FcPriceGroups,
      ),
      PriceSetActivationDateAndTime: normalizeJplFcDateTime(
        payload?.activationAt ??
          payload?.priceSetActivationDateAndTime ??
          payload?.PriceSetActivationDateAndTime,
        JPL_FC_DATE_TIME_ZERO,
      ),
    }),
  }

  return validateJplOutboundMessage(request)
}

const buildClearPendingPriceSetRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'clear_PendingFcPriceSet_req' as JplCommandName,
    subCode: '00H',
    data: {
      FcPriceSetId: padId2(
        payload?.fcPriceSetId ??
          payload?.FcPriceSetId ??
          payload?.priceSetId ??
          JPL_ID_ZERO,
      ),
      PriceSetActivationDateAndTime: normalizeJplFcDateTime(
        payload?.activationAt ??
          payload?.priceSetActivationDateAndTime ??
          payload?.PriceSetActivationDateAndTime,
        JPL_FC_DATE_TIME_ZERO,
      ),
    },
  })

const buildPumpTotalsRequest = (name: JplCommandName, payload: any) =>
  validateJplOutboundMessage({
    name,
    subCode: normalizeCode1(payload?.subCode ?? payload?.SubCode ?? '01H'),
    data: {
      FpId: normalizeJplId2(
        payload?.pumpNumber ?? payload?.fpId ?? payload?.FpId,
      ),
    },
  })

const buildFallbackTotalsRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'FbTotals_req' as JplCommandName,
    subCode: '00H',
    data: {
      FpId: normalizeJplId2(
        payload?.pumpNumber ?? payload?.fpId ?? payload?.FpId,
      ),
    },
  })

const buildClearFallbackTotalsRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'clear_FallbackTotals_req' as JplCommandName,
    subCode: '00H',
    data: {
      FbTotalsSeqNo: normalizeDec2(
        payload?.fbTotalsSeqNo ?? payload?.FbTotalsSeqNo,
      ),
      TotalNoFbTransactions: normalizeJplDec6(
        payload?.totalNoFbTransactions ?? payload?.TotalNoFbTransactions,
      ),
    },
  })

const buildTankControlStatusRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'TankControlStatus_req' as JplCommandName,
    subCode: '00H',
    data: {
      TankId: normalizeId2OrZero(
        payload?.tankId ?? payload?.TankId ?? payload?.tgId ?? payload?.TgId,
        JPL_ID_ZERO,
      ),
    },
  })

const buildMarkDeliveryRequest = (name: JplCommandName, payload: any) =>
  validateJplOutboundMessage({
    name,
    subCode: '00H',
    data: cleanObject({
      PosId: normalizeJplPosId(
        payload?.posId ??
          payload?.PosId ??
          getForecourtRuntimeConfig().jplPosId ??
          '01',
        '01',
        { allowZero: true },
      ),
      DeliveryReturnBytes:
        name === 'mark_DeliveryStarting_req'
          ? normalizeByteList(
              payload?.deliveryReturnBytes ?? payload?.DeliveryReturnBytes,
            )
          : undefined,
    }),
  })

const buildTankBlockRequest = (name: JplCommandName, payload: any) =>
  validateJplOutboundMessage({
    name,
    subCode: '00H',
    data: {
      TankId: normalizeJplId2(
        payload?.tankId ?? payload?.TankId ?? payload?.tgId ?? payload?.TgId,
      ),
    },
  })

const buildClearTgErrorRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'clear_TgError_req' as JplCommandName,
    subCode: '00H',
    data: {
      TgId: normalizeJplId2(
        payload?.tgId ?? payload?.TgId ?? payload?.tankId ?? payload?.TankId,
      ),
      TgErrorCode: String(payload?.tgErrorCode ?? payload?.TgErrorCode ?? '00')
        .trim()
        .padStart(2, '0'),
    },
  })

const buildResetTgRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'reset_Tg_req' as JplCommandName,
    subCode: '00H',
    data: {
      TgId: normalizeJplId2(
        payload?.tgId ?? payload?.TgId ?? payload?.tankId ?? payload?.TankId,
      ),
    },
  })

const buildFcDateTimeRequest = () =>
  validateJplOutboundMessage({
    name: 'FcDateAndTime_req' as JplCommandName,
    subCode: '00H',
    data: {},
  })

const buildChangeFcDateTimeRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'change_FcDateAndTime_req' as JplCommandName,
    subCode: '00H',
    data: {
      FcDateAndTime: normalizeJplFcDateTime(
        payload?.fcDateAndTime ?? payload?.FcDateAndTime,
      ),
    },
  })

const buildFcOperationModeStatusRequest = () =>
  validateJplOutboundMessage({
    name: 'FcOperationModeStatus_req' as JplCommandName,
    subCode: '00H',
    data: {},
  })

const buildChangeFcOperationModeRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'change_FcOperationModeNo_req' as JplCommandName,
    subCode: '00H',
    data: {
      FcOperationModeNo: Number(
        payload?.fcOperationModeNo ?? payload?.FcOperationModeNo ?? 0,
      ),
    },
  })

const buildUtilEchoRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'UtilEcho_req' as JplCommandName,
    subCode: '00H',
    data: {
      EchoData: Array.isArray(payload?.echoData ?? payload?.EchoData)
        ? (payload?.echoData ?? payload?.EchoData)
        : [],
    },
  })

const buildChangeFcStatusUpdateModeRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'change_FcStatusUpdateMode_req' as JplCommandName,
    subCode: '00H',
    data: {
      StatusUpdateCode: toNonNegativeInt(
        payload?.statusUpdateCode ?? payload?.StatusUpdateCode,
      ),
    },
  })

const buildClearFcServiceMessageRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'clear_FcServiceMsg_req' as JplCommandName,
    subCode: '00H',
    data: {
      FcServiceMsgSeqNo: normalizeDec2(
        payload?.fcServiceMsgSeqNo ?? payload?.FcServiceMsgSeqNo,
      ),
    },
  })

const buildBackOfficeRecordRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'BackOfficeRecord_req' as JplCommandName,
    subCode: normalizeCode1(payload?.subCode ?? payload?.SubCode ?? '00H'),
    data: {},
  })

const buildStoreBackOfficeRecordRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'store_BackOfficeRecord_req' as JplCommandName,
    subCode: '00H',
    data: {
      BorClientType: normalizeCode1(
        payload?.borClientType ?? payload?.BorClientType ?? '01H',
      ),
      BorClientId: normalizeId2OrZero(
        payload?.borClientId ?? payload?.BorClientId,
        JPL_ID_ZERO,
      ),
      BorDataType: normalizeCode1(
        payload?.borDataType ?? payload?.BorDataType ?? '00H',
      ),
      BorData: String(payload?.borData ?? payload?.BorData ?? ''),
    },
  })

const buildClearBackOfficeRecordRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'clear_BackOfficeRecord_req' as JplCommandName,
    subCode: '00H',
    data: {
      BorSeqNo: normalizeDec2(payload?.borSeqNo ?? payload?.BorSeqNo),
    },
  })

const buildClientDataRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'ClientData_req' as JplCommandName,
    subCode: '00H',
    data: {
      PosId: normalizeJplPosId(
        payload?.posId ?? payload?.PosId ?? JPL_ID_ZERO,
        JPL_ID_ZERO,
        { allowZero: true },
      ),
      ClientDataOffset: toNonNegativeInt(
        payload?.clientDataOffset ?? payload?.ClientDataOffset,
      ),
      ClientDataLen: toNonNegativeInt(
        payload?.clientDataLen ?? payload?.ClientDataLen,
      ),
    },
  })

const buildStoreClientDataRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'store_ClientData_req' as JplCommandName,
    subCode: '00H',
    data: {
      PosId: normalizeJplPosId(
        payload?.posId ?? payload?.PosId ?? JPL_ID_ZERO,
        JPL_ID_ZERO,
        { allowZero: true },
      ),
      ClientDataOffset: toNonNegativeInt(
        payload?.clientDataOffset ?? payload?.ClientDataOffset,
      ),
      ClientData:
        normalizeByteList(payload?.clientData ?? payload?.ClientData) ?? [],
    },
  })

const buildChangeFpOperationModeSetRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'change_FpOperationModeSet_req' as JplCommandName,
    subCode: '00H',
    data: {
      FpId: normalizeJplId2(
        payload?.pumpNumber ?? payload?.fpId ?? payload?.FpId,
      ),
      FpOperationModes:
        normalizeFpOperationModes(
          payload?.fpOperationModes ?? payload?.FpOperationModes,
        ) ?? [],
    },
  })

const buildTgDataRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'TgData_req' as JplCommandName,
    subCode: '00H',
    data: {
      TgId: normalizeJplId2(
        payload?.tgId ?? payload?.TgId ?? payload?.tankId ?? payload?.TankId,
      ),
      TankDataItemId:
        normalizeId2List(payload?.tankDataItemId ?? payload?.TankDataItemId) ??
        ALL_TANK_DATA_ITEM_IDS,
    },
  })

const buildChangeDynamicTankDataRequest = (payload: any) => {
  const normalized = normalizeDomsDynamicTankDataRequest(payload ?? {})

  return validateJplOutboundMessage({
    name: 'change_DynamicTankData_req' as JplCommandName,
    subCode: '00H',
    data: {
      TankId: normalized.tankId,
      DtdPars: normalized.dtdPars,
    },
  })
}

const buildTgErrorMessageRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'TgErrorMsg_req' as JplCommandName,
    subCode: '00H',
    data: {
      TgId: normalizeJplId2(
        payload?.tgId ?? payload?.TgId ?? payload?.tankId ?? payload?.TankId,
      ),
    },
  })

const buildChangeWpOperationModeSetRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'change_WpOperationModeSet_req' as JplCommandName,
    subCode: '00H',
    data: {
      WpId: normalizeJplId2(
        payload?.wpId ?? payload?.WpId ?? payload?.washPointId,
      ),
      WpOperationModes:
        normalizeWpOperationModes(
          payload?.wpOperationModes ?? payload?.WpOperationModes,
        ) ?? [],
    },
  })

const buildOpenWashPointRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'open_Wp_req' as JplCommandName,
    subCode: '00H',
    data: {
      WpId: normalizeJplId2(
        payload?.wpId ?? payload?.WpId ?? payload?.washPointId,
      ),
      PosId: normalizeJplPosId(
        payload?.posId ??
          payload?.PosId ??
          getForecourtRuntimeConfig().jplPosId ??
          '01',
        '01',
        { allowZero: true },
      ),
      WpOperationModeNo: toNonNegativeInt(
        payload?.wpOperationModeNo ?? payload?.WpOperationModeNo,
      ),
    },
  })

const buildCloseWashPointRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'close_Wp_req' as JplCommandName,
    subCode: '00H',
    data: {
      WpId: normalizeId2OrZero(
        payload?.wpId ?? payload?.WpId ?? payload?.washPointId,
        JPL_ID_ZERO,
      ),
    },
  })

const buildReadWpUnsupervisedTransactionRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'WpUnSupTrans_req' as JplCommandName,
    subCode: '00H',
    data: {
      WpId: normalizeJplId2(
        payload?.wpId ?? payload?.WpId ?? payload?.washPointId,
      ),
      TransSeqNo: toDec4(payload?.transSeqNo ?? payload?.TransSeqNo),
      PosId: normalizeJplPosId(
        payload?.posId ?? payload?.PosId ?? JPL_ID_ZERO,
        JPL_ID_ZERO,
        { allowZero: true },
      ),
      WpTransParId: normalizeId2List(
        payload?.wpTransParId ?? payload?.WpTransParId,
      ) ?? ['41'],
      RcpItemIdEptRd:
        normalizeId2List(payload?.rcpItemIdEptRd ?? payload?.RcpItemIdEptRd) ??
        [],
    },
  })

const buildUnlockWpUnsupervisedTransactionRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'unlock_WpUnSupTrans_req' as JplCommandName,
    subCode: '00H',
    data: {
      WpId: normalizeJplId2(
        payload?.wpId ?? payload?.WpId ?? payload?.washPointId,
      ),
      PosId: normalizeJplPosId(
        payload?.posId ?? payload?.PosId ?? JPL_ID_ZERO,
        JPL_ID_ZERO,
        { allowZero: true },
      ),
      TransSeqNo: toDec4(payload?.transSeqNo ?? payload?.TransSeqNo),
    },
  })

const buildClearWpUnsupervisedTransactionRequest = (payload: any) =>
  validateJplOutboundMessage({
    name: 'clear_WpUnSupTrans_req' as JplCommandName,
    subCode: '00H',
    data: {
      WpId: normalizeJplId2(
        payload?.wpId ?? payload?.WpId ?? payload?.washPointId,
      ),
      PosId: normalizeJplPosId(
        payload?.posId ?? payload?.PosId ?? JPL_ID_ZERO,
        JPL_ID_ZERO,
        { allowZero: true },
      ),
      TransSeqNo: toDec4(payload?.transSeqNo ?? payload?.TransSeqNo),
      Money: String(payload?.money ?? payload?.Money ?? '').trim(),
    },
  })

export const buildJplCommandRequest = (
  action: string,
  payload: any,
): JplCommandRequest | null => {
  payload ??= {}
  const normalized = normalizeJplCommandAction(action)
  const cfg = getForecourtRuntimeConfig()

  if (
    normalized === 'GET_PRICE_SET_STATUS' ||
    normalized === 'READ_PRICE_SET_STATUS'
  ) {
    return buildPriceSetStatusRequest(payload)
  }

  if (
    normalized === 'GET_CURRENT_PRICE_SET' ||
    normalized === 'READ_CURRENT_PRICE_SET'
  ) {
    return buildReadPriceSetRequest({ ...payload, priceSetType: '00H' })
  }

  if (
    normalized === 'GET_PENDING_PRICE_SET' ||
    normalized === 'READ_PENDING_PRICE_SET'
  ) {
    return buildReadPriceSetRequest({ ...payload, priceSetType: '01H' })
  }

  if (
    normalized === 'CHANGE_PRICE_SET' ||
    normalized === 'SCHEDULE_PRICE_SET' ||
    normalized === 'CHANGE_FC_PRICE_SET'
  ) {
    return buildChangePriceSetRequest(payload)
  }

  if (
    normalized === 'CLEAR_PENDING_PRICE_SET' ||
    normalized === 'CLEAR_PENDING_FC_PRICE_SET'
  ) {
    return buildClearPendingPriceSetRequest(payload)
  }

  if (
    normalized === 'GET_FP_GRADE_TOTALS' ||
    normalized === 'READ_FP_GRADE_TOTALS'
  ) {
    return buildPumpTotalsRequest(
      'FpGradeTotals_req' as JplCommandName,
      payload,
    )
  }

  if (
    normalized === 'GET_PUMP_GRADE_TOTALS' ||
    normalized === 'READ_PUMP_GRADE_TOTALS'
  ) {
    return buildPumpTotalsRequest(
      'PumpGradeTotals_req' as JplCommandName,
      payload,
    )
  }

  if (
    normalized === 'GET_PUMP_GRADE_BLEND_TOTALS' ||
    normalized === 'READ_PUMP_GRADE_BLEND_TOTALS'
  ) {
    return buildPumpTotalsRequest(
      'PumpGradeBlendTotals_req' as JplCommandName,
      {
        ...payload,
        subCode: payload?.subCode ?? payload?.SubCode ?? '00H',
      },
    )
  }

  if (
    normalized === 'GET_FALLBACK_TOTALS' ||
    normalized === 'READ_FALLBACK_TOTALS'
  ) {
    return buildFallbackTotalsRequest(payload)
  }

  if (normalized === 'CLEAR_FALLBACK_TOTALS') {
    return buildClearFallbackTotalsRequest(payload)
  }

  if (
    normalized === 'GET_TANK_CONTROL_STATUS' ||
    normalized === 'READ_TANK_CONTROL_STATUS'
  ) {
    return buildTankControlStatusRequest(payload)
  }

  if (normalized === 'MARK_DELIVERY_STARTING') {
    return buildMarkDeliveryRequest(
      'mark_DeliveryStarting_req' as JplCommandName,
      payload,
    )
  }

  if (normalized === 'MARK_DELIVERY_FINISHED') {
    return buildMarkDeliveryRequest(
      'mark_DeliveryFinished_req' as JplCommandName,
      payload,
    )
  }

  if (normalized === 'BLOCK_TANK') {
    return buildTankBlockRequest('block_Tank_req' as JplCommandName, payload)
  }

  if (normalized === 'UNBLOCK_TANK') {
    return buildTankBlockRequest('unblock_Tank_req' as JplCommandName, payload)
  }

  if (normalized === 'CLEAR_TG_ERROR') {
    return buildClearTgErrorRequest(payload)
  }

  if (normalized === 'RESET_TG') {
    return buildResetTgRequest(payload)
  }

  if (normalized === 'GET_FC_DATE_TIME' || normalized === 'READ_FC_DATE_TIME') {
    return buildFcDateTimeRequest()
  }

  if (
    normalized === 'CHANGE_FC_DATE_TIME' ||
    normalized === 'SET_FC_DATE_TIME'
  ) {
    return buildChangeFcDateTimeRequest(payload)
  }

  if (normalized === 'GET_FC_OPERATION_MODE_STATUS') {
    return buildFcOperationModeStatusRequest()
  }

  if (
    normalized === 'CHANGE_FC_OPERATION_MODE' ||
    normalized === 'SET_FC_OPERATION_MODE'
  ) {
    return buildChangeFcOperationModeRequest(payload)
  }

  if (normalized === 'UTIL_ECHO' || normalized === 'ECHO') {
    return buildUtilEchoRequest(payload)
  }

  if (normalized === 'GET_FC_STATUS' || normalized === 'READ_FC_STATUS') {
    return buildEmptyDataRequest('FcStatus_req' as JplCommandName)
  }

  if (
    normalized === 'CHANGE_FC_STATUS_UPDATE_MODE' ||
    normalized === 'SET_FC_STATUS_UPDATE_MODE'
  ) {
    return buildChangeFcStatusUpdateModeRequest(payload)
  }

  if (
    normalized === 'GET_FC_INSTALL_STATUS' ||
    normalized === 'READ_FC_INSTALL_STATUS'
  ) {
    return buildEmptyDataRequest(
      'FcInstallStatus_req' as JplCommandName,
      normalizeCode1(payload?.subCode ?? payload?.SubCode ?? '00H'),
    )
  }

  if (
    normalized === 'GET_POS_CONNECTION_STATUS' ||
    normalized === 'READ_POS_CONNECTION_STATUS'
  ) {
    return buildEmptyDataRequest('PosConnectionStatus_req' as JplCommandName)
  }

  if (
    normalized === 'GET_PSS_PERIPHERALS_STATUS' ||
    normalized === 'READ_PSS_PERIPHERALS_STATUS'
  ) {
    return buildEmptyDataRequest('PssPeripheralsStatus_req' as JplCommandName)
  }

  if (
    normalized === 'GET_FC_SERVICE_MESSAGE' ||
    normalized === 'READ_FC_SERVICE_MESSAGE' ||
    normalized === 'GET_FC_SERVICE_MSG' ||
    normalized === 'READ_FC_SERVICE_MSG'
  ) {
    return buildEmptyDataRequest('FcServiceMsg_req' as JplCommandName)
  }

  if (
    normalized === 'CLEAR_FC_SERVICE_MESSAGE' ||
    normalized === 'CLEAR_FC_SERVICE_MSG'
  ) {
    return buildClearFcServiceMessageRequest(payload)
  }

  if (
    normalized === 'GET_BACK_OFFICE_RECORD' ||
    normalized === 'READ_BACK_OFFICE_RECORD'
  ) {
    return buildBackOfficeRecordRequest(payload)
  }

  if (normalized === 'STORE_BACK_OFFICE_RECORD') {
    return buildStoreBackOfficeRecordRequest(payload)
  }

  if (normalized === 'CLEAR_BACK_OFFICE_RECORD') {
    return buildClearBackOfficeRecordRequest(payload)
  }

  if (normalized === 'GET_CLIENT_DATA' || normalized === 'READ_CLIENT_DATA') {
    return buildClientDataRequest(payload)
  }

  if (normalized === 'STORE_CLIENT_DATA') {
    return buildStoreClientDataRequest(payload)
  }

  if (
    normalized === 'GET_TG_DATA' ||
    normalized === 'READ_TG_DATA' ||
    normalized === 'GET_TANK_GAUGE_DATA' ||
    normalized === 'READ_TANK_GAUGE_DATA'
  ) {
    return buildTgDataRequest(payload)
  }

  if (
    normalized === 'CHANGE_DYNAMIC_TANK_DATA' ||
    normalized === 'SET_DYNAMIC_TANK_DATA'
  ) {
    return buildChangeDynamicTankDataRequest(payload)
  }

  if (normalized === 'GET_TG_ERROR' || normalized === 'READ_TG_ERROR') {
    return buildTgErrorMessageRequest(payload)
  }

  if (
    normalized === 'CHANGE_FP_OPERATION_MODE_SET' ||
    normalized === 'SET_FP_OPERATION_MODE_SET'
  ) {
    return buildChangeFpOperationModeSetRequest(payload)
  }

  if (
    normalized === 'CHANGE_WP_OPERATION_MODE_SET' ||
    normalized === 'SET_WP_OPERATION_MODE_SET'
  ) {
    return buildChangeWpOperationModeSetRequest(payload)
  }

  if (normalized === 'OPEN_WP' || normalized === 'OPEN_WASH_POINT') {
    return buildOpenWashPointRequest(payload)
  }

  if (normalized === 'CLOSE_WP' || normalized === 'CLOSE_WASH_POINT') {
    return buildCloseWashPointRequest(payload)
  }

  if (
    normalized === 'GET_WP_UNSUPERVISED_TRANSACTION' ||
    normalized === 'READ_WP_UNSUPERVISED_TRANSACTION'
  ) {
    return buildReadWpUnsupervisedTransactionRequest(payload)
  }

  if (normalized === 'UNLOCK_WP_UNSUPERVISED_TRANSACTION') {
    return buildUnlockWpUnsupervisedTransactionRequest(payload)
  }

  if (normalized === 'CLEAR_WP_UNSUPERVISED_TRANSACTION') {
    return buildClearWpUnsupervisedTransactionRequest(payload)
  }

  const fpId = padId2(payload?.pumpNumber ?? payload?.fpId ?? payload?.FpId)
  let resolvedPosId: string | null = null
  const getPosId = () => {
    resolvedPosId ??= normalizeJplPosId(
      payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
    )
    return resolvedPosId
  }

  if (normalized === 'OPEN' || normalized === 'OPEN_FP') {
    return validateJplOutboundMessage({
      name: 'open_Fp_req' as JplCommandName,
      subCode: '00H',
      data: {
        FpId: fpId,
        PosId: getPosId(),
        FpOperationModeNo: Number(
          payload?.fpOperationModeNo ?? payload?.FpOperationModeNo ?? 0,
        ),
      },
    })
  }

  if (normalized === 'CLOSE' || normalized === 'CLOSE_FP') {
    return validateJplOutboundMessage({
      name: 'close_Fp_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId, PosId: getPosId() },
    })
  }

  if (
    normalized === 'AUTHORIZE' ||
    normalized === 'AUTHORIZE_FP' ||
    normalized === 'RESUME' ||
    normalized === 'PRESET_AUTHORIZE' ||
    normalized === 'PRESET_FUEL_AUTH' ||
    normalized === 'AUTHORIZE_PRESET' ||
    normalized === 'EXTENDED_FUEL_AUTH' ||
    normalized === 'EXTENDED_AUTHORIZE' ||
    normalized === 'AUTHORIZE_EXTENDED' ||
    normalized === 'PREPARE_TRANSACTION' ||
    normalized === 'PREPARE_TRANS' ||
    normalized === 'PREPAY_SETUP' ||
    normalized === 'PREPAY_PREPARE'
  ) {
    const operation = resolveDispenseAuthorizationOperation({
      action: normalized,
      payload,
      fpId,
      posId: getPosId(),
    })
    return validateJplOutboundMessage(
      buildJplDispenseAuthorizationEnvelope(operation),
    )
  }

  if (normalized === 'GET_FP_STATUS' || normalized === 'READ_FP_STATUS') {
    const preferred = buildFpStatusSubCodePreference(
      String(payload?.subCode ?? payload?.SubCode ?? '03H'),
    )[0]
    const request = buildFpStatusEnvelope
      ? buildFpStatusEnvelope({
          fpId,
          variant: preferred,
        })
      : {
          name: 'FpStatus_req' as JplCommandName,
          subCode: preferred,
          data: { FpId: fpId },
        }

    return validateJplOutboundMessage(request)
  }

  if (normalized === 'GET_FP_INFO' || normalized === 'READ_FP_INFO') {
    return validateJplOutboundMessage({
      name: 'FpInfo_req' as JplCommandName,
      subCode: '01H',
      data: {
        FpId: fpId,
        ...(Array.isArray(payload?.FpInfoParId ?? payload?.fpInfoParId)
          ? { FpInfoParId: payload?.FpInfoParId ?? payload?.fpInfoParId }
          : {}),
      },
    })
  }

  if (
    normalized === 'GET_FP_FUELLING_DATA' ||
    normalized === 'READ_FP_FUELLING_DATA'
  ) {
    const request = buildFpFuellingDataEnvelope
      ? {
          ...buildFpFuellingDataEnvelope({ fpId }),
          subCode: String(payload?.subCode ?? payload?.SubCode ?? '01H')
            .trim()
            .toUpperCase(),
        }
      : {
          name: 'FpFuellingData_req' as JplCommandName,
          subCode: String(payload?.subCode ?? payload?.SubCode ?? '01H')
            .trim()
            .toUpperCase(),
          data: { FpId: fpId },
        }

    return validateJplOutboundMessage(request)
  }

  if (normalized === 'GET_FP_ERROR' || normalized === 'READ_FP_ERROR') {
    return validateJplOutboundMessage({
      name: 'FpErrorMsg_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId },
    })
  }

  if (normalized === 'OPEN_TANK_CONTROLLER') {
    return validateJplOutboundMessage({
      name: 'open_TankController_req' as JplCommandName,
      subCode: '00H',
      data: {
        TankId: padId2(payload?.tankId ?? payload?.TankId ?? payload?.tgId),
        PosId: normalizeJplPosId(
          payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
          '01',
          { allowZero: true },
        ),
        TankOperationModeNo: Number(
          payload?.tankOperationModeNo ?? payload?.TankOperationModeNo ?? 0,
        ),
      },
    })
  }

  if (normalized === 'CLOSE_TANK_CONTROLLER') {
    return validateJplOutboundMessage({
      name: 'close_TankController_req' as JplCommandName,
      subCode: '00H',
      data: {
        TankId: normalizeId2OrZero(
          payload?.tankId ?? payload?.TankId ?? payload?.tgId ?? JPL_ID_ZERO,
        ),
      },
    })
  }

  if (normalized === 'START_DELIVERY_PROCESS') {
    return validateJplOutboundMessage({
      name: 'start_DeliveryProcess_req' as JplCommandName,
      subCode: '00H',
      data: {
        TankId: padId2(payload?.tankId ?? payload?.TankId),
        PosId: normalizeJplPosId(
          payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
          '01',
          { allowZero: true },
        ),
        FcProductId: padId2(payload?.fcProductId ?? payload?.FcProductId),
        ...((payload?.startDeliveryProcessPars ??
        payload?.StartDeliveryProcessPars)
          ? {
              StartDeliveryProcessPars:
                payload?.startDeliveryProcessPars ??
                payload?.StartDeliveryProcessPars,
            }
          : {}),
      },
    })
  }

  if (normalized === 'STOP_DELIVERY_PROCESS') {
    return validateJplOutboundMessage({
      name: 'stop_DeliveryProcess_req' as JplCommandName,
      subCode: '00H',
      data: {
        TankId: padId2(payload?.tankId ?? payload?.TankId),
        PosId: normalizeJplPosId(
          payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
          '01',
          { allowZero: true },
        ),
      },
    })
  }

  if (normalized === 'GET_TG_STATUS' || normalized === 'READ_TG_STATUS') {
    return validateJplOutboundMessage({
      name: 'TgStatus_req' as JplCommandName,
      subCode: String(payload?.subCode ?? payload?.SubCode ?? '01H')
        .trim()
        .toUpperCase(),
      data: {
        TgId: padId2(
          payload?.tgId ?? payload?.TgId ?? payload?.tankId ?? payload?.TankId,
        ),
      },
    })
  }

  if (
    normalized === 'GET_SITE_DELIVERY_STATUS' ||
    normalized === 'READ_SITE_DELIVERY_STATUS'
  ) {
    return validateJplOutboundMessage({
      name: 'SiteDeliveryStatus_req' as JplCommandName,
      subCode: String(payload?.subCode ?? payload?.SubCode ?? '01H')
        .trim()
        .toUpperCase(),
      data: {},
    })
  }

  if (
    normalized === 'GET_TANK_DELIVERY_DATA' ||
    normalized === 'READ_TANK_DELIVERY_DATA'
  ) {
    return validateJplOutboundMessage({
      name: 'TankDeliveryData_req' as JplCommandName,
      subCode: '00H',
      data: {
        TgId: padId2(
          payload?.tgId ?? payload?.TgId ?? payload?.tankId ?? payload?.TankId,
        ),
        PosId: normalizeJplPosId(
          payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
          '01',
          { allowZero: true },
        ),
        ZERO: 0,
        TankDeliveryDataItemId:
          normalizeId2List(
            payload?.tankDeliveryDataItemId ?? payload?.TankDeliveryDataItemId,
          ) ?? ALL_TANK_DELIVERY_ITEM_IDS,
      },
    })
  }

  if (
    normalized === 'CLEAR_TANK_DELIVERY_DATA' ||
    normalized === 'ACK_TANK_DELIVERY_DATA'
  ) {
    return validateJplOutboundMessage({
      name: 'clear_TankDeliveryData_req' as JplCommandName,
      subCode: '00H',
      data: {
        PosId: normalizeJplPosId(
          payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
          '01',
          { allowZero: true },
        ),
        DeliveryReportSeqNo: normalizeDec2OrZero(
          payload?.deliveryReportSeqNo ?? payload?.DeliveryReportSeqNo,
        ),
        ...(normalizeTankDeliveries(
          payload?.tankDeliveries ?? payload?.TankDeliveries,
        )?.length
          ? {
              TankDeliveries: normalizeTankDeliveries(
                payload?.tankDeliveries ?? payload?.TankDeliveries,
              ),
            }
          : {}),
      },
    })
  }

  if (normalized === 'GET_PP_STATUS' || normalized === 'READ_PP_STATUS') {
    return validateJplOutboundMessage({
      name: 'PpStatus_req' as JplCommandName,
      subCode: '00H',
      data: {
        PpId: padId2(payload?.ppId ?? payload?.PpId ?? payload?.pricePoleId),
      },
    })
  }

  if (normalized === 'OPEN_PP' || normalized === 'OPEN_PRICE_POLE') {
    return validateJplOutboundMessage({
      name: 'open_Pp_req' as JplCommandName,
      subCode: '00H',
      data: {
        PpId: padId2(payload?.ppId ?? payload?.PpId ?? payload?.pricePoleId),
        PosId: getPosId(),
        PpOperationModeNo: Number(
          payload?.ppOperationModeNo ?? payload?.PpOperationModeNo ?? 0,
        ),
      },
    })
  }

  if (normalized === 'CLOSE_PP' || normalized === 'CLOSE_PRICE_POLE') {
    return validateJplOutboundMessage({
      name: 'close_Pp_req' as JplCommandName,
      subCode: '00H',
      data: {
        PpId: padId2(payload?.ppId ?? payload?.PpId ?? payload?.pricePoleId),
      },
    })
  }

  if (normalized === 'GET_PP_ERROR' || normalized === 'READ_PP_ERROR') {
    return validateJplOutboundMessage({
      name: 'PpErrorMsg_req' as JplCommandName,
      subCode: '00H',
      data: {
        PpId: padId2(payload?.ppId ?? payload?.PpId ?? payload?.pricePoleId),
      },
    })
  }

  if (normalized === 'CLEAR_PP_ERROR') {
    return validateJplOutboundMessage({
      name: 'clear_PpError_req' as JplCommandName,
      subCode: '00H',
      data: {
        PpId: padId2(payload?.ppId ?? payload?.PpId ?? payload?.pricePoleId),
        PpErrorCode: String(
          payload?.ppErrorCode ?? payload?.PpErrorCode ?? '00',
        )
          .trim()
          .padStart(2, '0'),
      },
    })
  }

  if (normalized === 'RESET_PP' || normalized === 'RESET_PRICE_POLE') {
    return validateJplOutboundMessage({
      name: 'reset_Pp_req' as JplCommandName,
      subCode: '00H',
      data: {
        PpId: padId2(payload?.ppId ?? payload?.PpId ?? payload?.pricePoleId),
      },
    })
  }

  if (normalized === 'GET_WP_STATUS' || normalized === 'READ_WP_STATUS') {
    return validateJplOutboundMessage({
      name: 'WpStatus_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
      },
    })
  }

  if (normalized === 'PREPARE_WP_AUTH' || normalized === 'PREPARE_WASH_AUTH') {
    return validateJplOutboundMessage({
      name: 'prepare_WpAuth_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: getPosId(),
        AuthorizePars: buildWashAuthorizeParsPayload(payload),
      },
    })
  }

  if (normalized === 'AUTHORIZE_WP' || normalized === 'AUTHORIZE_WASH') {
    return validateJplOutboundMessage({
      name: 'authorize_Wp_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: getPosId(),
        AuthorizePars: buildWashAuthorizeParsPayload(payload),
      },
    })
  }

  if (normalized === 'CANCEL_WP_AUTH' || normalized === 'CANCEL_WASH_AUTH') {
    return validateJplOutboundMessage({
      name: 'cancel_WpAuth_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: getPosId(),
      },
    })
  }

  if (normalized === 'STOP_WP' || normalized === 'STOP_WASH') {
    return validateJplOutboundMessage({
      name: 'stop_Wp_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: getPosId(),
      },
    })
  }

  if (normalized === 'RESUME_WP' || normalized === 'RESUME_WASH') {
    return validateJplOutboundMessage({
      name: 'cancel_WpStop_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: getPosId(),
      },
    })
  }

  if (normalized === 'GET_WP_ERROR' || normalized === 'READ_WP_ERROR') {
    return validateJplOutboundMessage({
      name: 'WpErrorMsg_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
      },
    })
  }

  if (normalized === 'CLEAR_WP_ERROR') {
    return validateJplOutboundMessage({
      name: 'clear_WpError_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        WpErrorCode: String(
          payload?.wpErrorCode ?? payload?.WpErrorCode ?? '00',
        )
          .trim()
          .padStart(2, '0'),
      },
    })
  }

  if (normalized === 'RESET_WP' || normalized === 'RESET_WASH') {
    return validateJplOutboundMessage({
      name: 'reset_Wp_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
      },
    })
  }

  if (normalized === 'GET_DIOP_STATUS' || normalized === 'READ_DIOP_STATUS') {
    return validateJplOutboundMessage({
      name: 'DiopStatus_req' as JplCommandName,
      subCode: '00H',
      data: {
        DiopId: padId2(
          payload?.diopId ?? payload?.DiopId ?? payload?.pinId ?? 0,
        ),
      },
    })
  }

  if (normalized === 'CHANGE_DIOP_OUTPUT' || normalized === 'SET_DIOP_OUTPUT') {
    return validateJplOutboundMessage({
      name: 'change_DiopOutput_req' as JplCommandName,
      subCode: '00H',
      data: {
        DiopId: padId2(
          payload?.diopId ?? payload?.DiopId ?? payload?.pinId ?? 0,
        ),
        DiopControl: normalizeCode1(
          payload?.diopControl ??
            payload?.DiopControl ??
            payload?.outputCode ??
            '00H',
        ),
      },
    })
  }

  if (
    normalized === 'GET_SENSOR_STATUS' ||
    normalized === 'READ_SENSOR_STATUS'
  ) {
    return validateJplOutboundMessage({
      name: 'SensorStatus_req' as JplCommandName,
      subCode: '00H',
      data: { SensorId: padId2(payload?.sensorId ?? payload?.SensorId) },
    })
  }

  if (normalized === 'GET_VM_STATUS' || normalized === 'READ_VM_STATUS') {
    return validateJplOutboundMessage({
      name: 'VmStatus_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
      },
    })
  }

  if (normalized === 'OPEN_VM' || normalized === 'OPEN_VENDING_MACHINE') {
    return validateJplOutboundMessage({
      name: 'open_Vm_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
        PosId: normalizeJplPosId(
          payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
          '01',
          { allowZero: true },
        ),
        VmOperationModeNo: toNonNegativeInt(
          payload?.vmOperationModeNo ?? payload?.VmOperationModeNo,
        ),
      },
    })
  }

  if (normalized === 'CLOSE_VM' || normalized === 'CLOSE_VENDING_MACHINE') {
    return validateJplOutboundMessage({
      name: 'close_Vm_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
      },
    })
  }

  if (
    normalized === 'GET_VM_DRYSTOCK_TOTALS' ||
    normalized === 'READ_VM_TOTALS'
  ) {
    return validateJplOutboundMessage({
      name: 'VmDrystockTotals_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
        VmTotalType: normalizeCode1(
          payload?.vmTotalType ?? payload?.VmTotalType ?? '01H',
        ),
      },
    })
  }

  if (normalized === 'GET_VM_ERROR' || normalized === 'READ_VM_ERROR') {
    return validateJplOutboundMessage({
      name: 'VmErrorMsg_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
      },
    })
  }

  if (normalized === 'CLEAR_VM_ERROR') {
    return validateJplOutboundMessage({
      name: 'clear_VmError_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
        VmErrorCode: String(
          payload?.vmErrorCode ?? payload?.VmErrorCode ?? '00',
        )
          .trim()
          .padStart(2, '0'),
      },
    })
  }

  if (normalized === 'RESET_VM' || normalized === 'RESET_VENDING_MACHINE') {
    return validateJplOutboundMessage({
      name: 'reset_Vm_req' as JplCommandName,
      subCode: '00H',
      data: {
        VmId: padId2(
          payload?.vmId ?? payload?.VmId ?? payload?.vendingMachineId,
        ),
      },
    })
  }

  if (normalized === 'CLEAR_SERIAL_SERVER_INSTALLATION') {
    return validateJplOutboundMessage({
      name: 'clear_InstallData_req' as JplCommandName,
      subCode: '01H',
      data: {
        ExtendedInstallMsgCode: EXTENDED_INSTALL_MESSAGE_CODES.serialServer,
        FcDeviceId: padId2(
          payload?.serialServerId ??
            payload?.SerialServerId ??
            payload?.fcDeviceId ??
            0,
        ),
      },
    })
  }

  if (normalized === 'CLEAR_INSTALLATION_DATA') {
    return validateJplOutboundMessage({
      name: 'clear_InstallData_req' as JplCommandName,
      subCode: '01H',
      data: {
        ExtendedInstallMsgCode: normalizeCode2(
          payload?.extendedInstallMsgCode ?? payload?.ExtendedInstallMsgCode,
          '0000H',
        ),
        FcDeviceId: padId2(payload?.fcDeviceId ?? payload?.FcDeviceId ?? 0),
      },
    })
  }

  if (
    normalized === 'CANCEL' ||
    normalized === 'CANCEL_AUTH' ||
    normalized === 'CANCEL_AUTHORIZE' ||
    normalized === 'CANCEL_FP_AUTH' ||
    normalized === 'STOP'
  ) {
    return validateJplOutboundMessage({
      name: 'cancel_FpAuth_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId, PosId: getPosId() },
    })
  }

  if (
    normalized === 'ESTOP' ||
    normalized === 'ESTOP_FP' ||
    normalized === 'EMERGENCY_STOP_FP'
  ) {
    return validateJplOutboundMessage({
      name: 'estop_Fp_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId, PosId: getPosId() },
    })
  }

  if (
    normalized === 'CANCEL_FP_ESTOP' ||
    normalized === 'CLEAR_FP_ESTOP' ||
    normalized === 'RELEASE_FP_ESTOP'
  ) {
    return validateJplOutboundMessage({
      name: 'cancel_FpEstop_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId, PosId: getPosId() },
    })
  }

  if (normalized === 'RESET_FP' || normalized === 'FORCE_RESET_FP') {
    return validateJplOutboundMessage({
      name: 'reset_Fp_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId },
    })
  }

  if (normalized === 'CLEAR_FP_ERROR' || normalized === 'CLEAR_ERROR') {
    return validateJplOutboundMessage({
      name: 'clear_FpError_req' as JplCommandName,
      subCode: '00H',
      data: {
        FpId: fpId,
        FpErrorCode: String(
          payload?.fpErrorCode ?? payload?.FpErrorCode ?? '00',
        ).padStart(2, '0'),
      },
    })
  }

  if (
    normalized === 'GET_SUPERVISED_TRANSACTION' ||
    normalized === 'READ_SUPERVISED_TRANSACTION'
  ) {
    return buildReadSupervisedTransactionRequest({
      fpId,
      posId: padId2(payload?.posId ?? payload?.PosId ?? '00'),
      transSeqNo: payload?.transSeqNo ?? payload?.TransSeqNo ?? '',
      transParId: payload?.TransParId ??
        payload?.transParId ?? [...DEFAULT_TRANSACTION_PAR_IDS],
    })
  }

  if (normalized === 'UNLOCK_SUPERVISED_TRANSACTION') {
    return buildUnlockSupervisedTransactionRequest({
      fpId,
      posId: padId2(payload?.posId ?? payload?.PosId ?? getPosId()),
      transSeqNo: payload?.transSeqNo ?? payload?.TransSeqNo ?? '',
    })
  }

  if (normalized === 'CLEAR_SUPERVISED_TRANSACTION') {
    return buildClearSupervisedTransactionRequest({
      fpId,
      posId: padId2(payload?.posId ?? payload?.PosId ?? getPosId()),
      transSeqNo: payload?.transSeqNo ?? payload?.TransSeqNo ?? '',
      payload,
    })
  }

  if (
    normalized === 'GET_UNSUPERVISED_TRANSACTION' ||
    normalized === 'READ_UNSUPERVISED_TRANSACTION'
  ) {
    return validateJplOutboundMessage({
      name: 'FpUnSupTrans_req' as JplCommandName,
      subCode: '00H',
      data: {
        FpId: fpId,
        TransSeqNo: toDec4(payload?.transSeqNo ?? payload?.TransSeqNo ?? ''),
        PosId: padId2(payload?.posId ?? payload?.PosId ?? '00'),
        TransParId: Array.isArray(payload?.TransParId ?? payload?.transParId)
          ? (payload?.TransParId ?? payload?.transParId)
          : [...DEFAULT_TRANSACTION_PAR_IDS],
      },
    })
  }

  if (normalized === 'UNLOCK_UNSUPERVISED_TRANSACTION') {
    return validateJplOutboundMessage({
      name: 'unlock_FpUnSupTrans_req' as JplCommandName,
      subCode: '00H',
      data: {
        FpId: fpId,
        PosId: padId2(payload?.posId ?? payload?.PosId ?? getPosId()),
        TransSeqNo: toDec4(payload?.transSeqNo ?? payload?.TransSeqNo ?? ''),
      },
    })
  }

  if (normalized === 'CLEAR_UNSUPERVISED_TRANSACTION') {
    const useExtended = Boolean(
      payload?.Vol_e ??
      payload?.vol_e ??
      payload?.Money_e ??
      payload?.money_e ??
      payload?.EptReceiptFormatId ??
      payload?.eptReceiptFormatId ??
      payload?.EptReceiptItems ??
      payload?.eptReceiptItems,
    )

    return validateJplOutboundMessage({
      name: 'clear_FpUnSupTrans_req' as JplCommandName,
      subCode: useExtended ? '03H' : '00H',
      data: {
        FpId: fpId,
        PosId: padId2(payload?.posId ?? payload?.PosId ?? getPosId()),
        TransSeqNo: toDec4(payload?.transSeqNo ?? payload?.TransSeqNo ?? ''),
        ...(payload?.Vol_e != null || payload?.vol_e != null
          ? { Vol_e: String(payload?.Vol_e ?? payload?.vol_e) }
          : {}),
        ...(payload?.Money_e != null || payload?.money_e != null
          ? { Money_e: String(payload?.Money_e ?? payload?.money_e) }
          : {}),
        ...(payload?.Money != null || payload?.money != null
          ? { Money: String(payload?.Money ?? payload?.money) }
          : {}),
        ...(payload?.EptReceiptFormatId != null ||
        payload?.eptReceiptFormatId != null
          ? {
              EptReceiptFormatId: padId2(
                payload?.EptReceiptFormatId ?? payload?.eptReceiptFormatId,
              ),
            }
          : {}),
        ...((payload?.EptReceiptItems ?? payload?.eptReceiptItems) &&
        typeof (payload?.EptReceiptItems ?? payload?.eptReceiptItems) ===
          'object'
          ? {
              EptReceiptItems:
                payload?.EptReceiptItems ?? payload?.eptReceiptItems,
            }
          : {}),
      },
    })
  }

  if (normalized === 'FINALIZE_TRANSACTION') {
    const transSeqNo = String(
      payload?.transSeqNo ?? payload?.TransSeqNo ?? '',
    ).trim()
    if (!transSeqNo) return null

    return buildClearSupervisedTransactionRequest({
      fpId,
      posId: getPosId(),
      transSeqNo,
      payload,
    })
  }

  return null
}

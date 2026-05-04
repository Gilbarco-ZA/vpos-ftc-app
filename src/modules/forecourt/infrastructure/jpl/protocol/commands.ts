import * as DomsPosJpl from '@gilbarcoafs/doms-pos-jpl'

import { padId2 } from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtimeConfig'

import {
  buildFpStatusSubCodePreference,
  resolveDispenseAuthorizeMode,
} from '@/src/modules/forecourt/infrastructure/jpl/dispense'
import { normalizeJplPosId } from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import { validateJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import {
  buildClearSupervisedTransactionRequest,
  buildReadSupervisedTransactionRequest,
  buildUnlockSupervisedTransactionRequest,
  DEFAULT_TRANSACTION_PAR_IDS,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'

export type JplCommandName =
  | 'open_Fp_req'
  | 'close_Fp_req'
  | 'authorize_Fp_req'
  | 'prepare_Trans_req'
  | 'cancel_FpAuth_req'
  | 'clear_FpError_req'
  | 'FpSupTrans_req'
  | 'unlock_FpSupTrans_req'
  | 'clear_FpSupTrans_req'
  | 'FpUnSupTrans_req'
  | 'unlock_FpUnSupTrans_req'
  | 'clear_FpUnSupTrans_req'
  | 'FpStatus_req'
  | 'FpInfo_req'
  | 'FpFuellingData_req'
  | 'FpErrorMsg_req'
  | 'estop_Fp_req'
  | 'cancel_FpEstop_req'
  | 'reset_Fp_req'
  | 'TgStatus_req'
  | 'open_TankController_req'
  | 'close_TankController_req'
  | 'start_DeliveryProcess_req'
  | 'stop_DeliveryProcess_req'
  | 'SiteDeliveryStatus_req'
  | 'TankDeliveryData_req'
  | 'clear_TankDeliveryData_req'
  | 'clear_InstallData_req'
  | 'PpStatus_req'
  | 'open_Pp_req'
  | 'close_Pp_req'
  | 'PpErrorMsg_req'
  | 'clear_PpError_req'
  | 'reset_Pp_req'
  | 'WpStatus_req'
  | 'prepare_WpAuth_req'
  | 'authorize_Wp_req'
  | 'cancel_WpAuth_req'
  | 'stop_Wp_req'
  | 'cancel_WpStop_req'
  | 'WpErrorMsg_req'
  | 'clear_WpError_req'
  | 'reset_Wp_req'
  | 'DiopStatus_req'
  | 'change_DiopOutput_req'
  | 'SensorStatus_req'
  | 'VmStatus_req'
  | 'open_Vm_req'
  | 'close_Vm_req'
  | 'VmDrystockTotals_req'
  | 'VmErrorMsg_req'
  | 'clear_VmError_req'
  | 'reset_Vm_req'

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

const normalizeCode1 = (value: unknown, fallback = '00H') => {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
  if (/^[0-9A-F]{2}H$/.test(raw)) return raw
  const numeric = Number(raw.replace(/H$/, ''))
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 255) {
    return `${String(Math.trunc(numeric)).padStart(2, '0')}H`
  }
  return fallback
}

const normalizeCode2 = (value: unknown, fallback = '0000H') => {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
  if (/^[0-9A-F]{4}H$/.test(raw)) return raw
  const numeric = Number(raw.replace(/H$/, ''))
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 0xffff) {
    return `${String(Math.trunc(numeric)).padStart(4, '0')}H`
  }
  return fallback
}

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

const toBoolInt = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 1 : 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

const cleanObject = (value: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )

const normalizeId2List = (value: unknown) =>
  maybeArray(value)
    ?.map((entry) => padId2(entry as any))
    .filter(Boolean)

const buildAuthorizeParsPayload = (payload: any) => {
  const nested = payload?.AuthorizePars ?? payload?.authorizePars
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested
  }

  const authorizePars = cleanObject({
    SmId:
      payload?.SmId != null || payload?.smId != null
        ? padId2(payload?.SmId ?? payload?.smId)
        : undefined,
    FmgId:
      payload?.FmgId != null || payload?.fmgId != null
        ? padId2(payload?.FmgId ?? payload?.fmgId)
        : undefined,
    PgId:
      payload?.PgId != null || payload?.pgId != null
        ? padId2(payload?.PgId ?? payload?.pgId)
        : undefined,
    ValidGrades: normalizeId2List(payload?.ValidGrades ?? payload?.validGrades),
    StartLimit: payload?.StartLimit ?? payload?.startLimit,
    FpTransReturnData: maybeArray(
      payload?.FpTransReturnData ?? payload?.fpTransReturnData,
    ),
    LogData: payload?.LogData ?? payload?.logData,
    AutoLockId:
      payload?.AutoLockId != null || payload?.autoLockId != null
        ? padId2(payload?.AutoLockId ?? payload?.autoLockId)
        : undefined,
    FpGradePriceDiscounts: maybeArray(
      payload?.FpGradePriceDiscounts ?? payload?.fpGradePriceDiscounts,
    ),
    LockFpPrices: toBoolInt(payload?.LockFpPrices ?? payload?.lockFpPrices),
    StartLimit_e: payload?.StartLimit_e ?? payload?.startLimit_e,
    FpGradePriceDiscounts_e: maybeArray(
      payload?.FpGradePriceDiscounts_e ?? payload?.fpGradePriceDiscounts_e,
    ),
    FpTransReturnData2: maybeArray(
      payload?.FpTransReturnData2 ?? payload?.fpTransReturnData2,
    ),
    PriceLevel: payload?.PriceLevel ?? payload?.priceLevel,
    AuthRefId: payload?.AuthRefId ?? payload?.authRefId,
    AuthRefName: payload?.AuthRefName ?? payload?.authRefName,
    TopUpMoneyLimit_e: payload?.TopUpMoneyLimit_e ?? payload?.topUpMoneyLimit_e,
    TotalPreauthorizedMoneyLimit_e:
      payload?.TotalPreauthorizedMoneyLimit_e ??
      payload?.totalPreauthorizedMoneyLimit_e,
  })

  return Object.keys(authorizePars).length ? authorizePars : undefined
}

const toPresetPayload = (payload: any) => {
  const request: any = {
    name: 'authorize_Fp_req' as JplCommandName,
    subCode: '01H',
    data: {
      FpId: padId2(payload?.pumpNumber ?? payload?.fpId ?? payload?.FpId),
      PosId: normalizeJplPosId(payload?.posId ?? payload?.PosId ?? '01'),
      PresetType: String(payload?.presetType ?? payload?.PresetType ?? '00H')
        .trim()
        .toUpperCase(),
    },
  }

  const presetFields = [
    'VoidPresetLimit',
    'VolumePresetLimit',
    'MoneyPresetLimit',
    'FloorPresetLimit',
  ]
  for (const key of presetFields) {
    const camel = key.charAt(0).toLowerCase() + key.slice(1)
    const value = payload?.[key] ?? payload?.[camel]
    if (value != null && String(value).trim() !== '') {
      request.data[key] = String(value).trim()
    }
  }

  return request
}

export const describeJplAuthorizeRequest = (
  action: string,
  payload: Record<string, unknown> | null | undefined,
) => ({
  authorizeMode: resolveDispenseAuthorizeMode(action, payload ?? undefined),
})

export const buildJplCommandRequest = (
  action: string,
  payload: any,
): JplCommandRequest | null => {
  const normalized = normalizeJplCommandAction(action)
  const cfg = getForecourtRuntimeConfig()

  const fpId = padId2(payload?.pumpNumber ?? payload?.fpId ?? payload?.FpId)
  const posId = normalizeJplPosId(
    payload?.posId ?? payload?.PosId ?? cfg.jplPosId ?? '01',
  )

  if (normalized === 'OPEN' || normalized === 'OPEN_FP') {
    return validateJplOutboundMessage({
      name: 'open_Fp_req' as JplCommandName,
      subCode: '00H',
      data: {
        FpId: fpId,
        PosId: posId,
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
      data: { FpId: fpId, PosId: posId },
    })
  }

  if (
    normalized === 'AUTHORIZE' ||
    normalized === 'AUTHORIZE_FP' ||
    normalized === 'RESUME'
  ) {
    return validateJplOutboundMessage({
      name: 'authorize_Fp_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId, PosId: posId },
    })
  }

  if (
    normalized === 'PRESET_AUTHORIZE' ||
    normalized === 'PRESET_FUEL_AUTH' ||
    normalized === 'AUTHORIZE_PRESET'
  ) {
    const request = toPresetPayload({ ...payload, posId })
    return validateJplOutboundMessage(request)
  }

  if (
    normalized === 'EXTENDED_FUEL_AUTH' ||
    normalized === 'EXTENDED_AUTHORIZE' ||
    normalized === 'AUTHORIZE_EXTENDED'
  ) {
    return validateJplOutboundMessage({
      name: 'authorize_Fp_req' as JplCommandName,
      subCode: '02H',
      data: {
        FpId: fpId,
        PosId: posId,
        AuthorizePars: buildAuthorizeParsPayload(payload),
      },
    })
  }

  if (
    normalized === 'PREPARE_TRANSACTION' ||
    normalized === 'PREPARE_TRANS' ||
    normalized === 'PREPAY_SETUP' ||
    normalized === 'PREPAY_PREPARE'
  ) {
    return validateJplOutboundMessage({
      name: 'prepare_Trans_req' as JplCommandName,
      subCode: '01H',
      data: {
        FpId: fpId,
        PosId: posId,
        AuthorizePars: buildAuthorizeParsPayload(payload),
      },
    })
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
        TankId: padId2(
          payload?.tankId ?? payload?.TankId ?? payload?.tgId ?? 0,
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
        ),
        ZERO: 1,
        TankDeliveryDataItemId: Array.isArray(
          payload?.tankDeliveryDataItemId ?? payload?.TankDeliveryDataItemId,
        )
          ? (payload?.tankDeliveryDataItemId ?? payload?.TankDeliveryDataItemId)
          : ALL_TANK_DELIVERY_ITEM_IDS,
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
        ),
        DeliveryReportSeqNo: String(
          payload?.deliveryReportSeqNo ?? payload?.DeliveryReportSeqNo ?? '0',
        ),
        ...(Array.isArray(payload?.tankDeliveries ?? payload?.TankDeliveries)
          ? {
              TankDeliveries:
                payload?.tankDeliveries ?? payload?.TankDeliveries,
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
        PosId: posId,
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
        PosId: posId,
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
        PosId: posId,
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
        PosId: posId,
      },
    })
  }

  if (normalized === 'STOP_WP' || normalized === 'STOP_WASH') {
    return validateJplOutboundMessage({
      name: 'stop_Wp_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: posId,
      },
    })
  }

  if (normalized === 'RESUME_WP' || normalized === 'RESUME_WASH') {
    return validateJplOutboundMessage({
      name: 'cancel_WpStop_req' as JplCommandName,
      subCode: '00H',
      data: {
        WpId: padId2(payload?.wpId ?? payload?.WpId ?? payload?.washPointId),
        PosId: posId,
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
      data: { FpId: fpId, PosId: posId },
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
      data: { FpId: fpId, PosId: posId },
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
      data: { FpId: fpId, PosId: posId },
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
      posId: padId2(payload?.posId ?? payload?.PosId ?? posId),
      transSeqNo: payload?.transSeqNo ?? payload?.TransSeqNo ?? '',
    })
  }

  if (normalized === 'CLEAR_SUPERVISED_TRANSACTION') {
    return buildClearSupervisedTransactionRequest({
      fpId,
      posId: padId2(payload?.posId ?? payload?.PosId ?? posId),
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
        TransSeqNo: String(payload?.transSeqNo ?? payload?.TransSeqNo ?? '')
          .trim()
          .padStart(4, '0'),
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
        PosId: padId2(payload?.posId ?? payload?.PosId ?? posId),
        TransSeqNo: String(payload?.transSeqNo ?? payload?.TransSeqNo ?? '')
          .trim()
          .padStart(4, '0'),
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
        PosId: padId2(payload?.posId ?? payload?.PosId ?? posId),
        TransSeqNo: String(payload?.transSeqNo ?? payload?.TransSeqNo ?? '')
          .trim()
          .padStart(4, '0'),
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
      posId,
      transSeqNo,
      payload,
    })
  }

  return null
}

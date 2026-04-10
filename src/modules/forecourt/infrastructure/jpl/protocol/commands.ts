import { padId2 } from '@/src/shared/forecourt/adapters/jplTcpAdapter.helpers'
import { getForecourtRuntimeConfig } from '@/src/shared/forecourt/runtimeConfig'

import { normalizeJplPosId } from '@/src/modules/forecourt/infrastructure/jpl/protocol/bootstrap'
import { validateJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import { DEFAULT_TRANSACTION_PAR_IDS } from '@/src/modules/forecourt/infrastructure/jpl/transactionService'

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
  | 'SiteDeliveryStatus_req'
  | 'TankDeliveryData_req'
  | 'clear_TankDeliveryData_req'

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

export const buildJplCommandRequest = (action: string, payload: any) => {
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
    return validateJplOutboundMessage({
      name: 'FpStatus_req' as JplCommandName,
      subCode: String(payload?.subCode ?? payload?.SubCode ?? '03H')
        .trim()
        .toUpperCase(),
      data: { FpId: fpId },
    })
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
    return validateJplOutboundMessage({
      name: 'FpFuellingData_req' as JplCommandName,
      subCode: String(payload?.subCode ?? payload?.SubCode ?? '01H')
        .trim()
        .toUpperCase(),
      data: { FpId: fpId },
    })
  }

  if (normalized === 'GET_FP_ERROR' || normalized === 'READ_FP_ERROR') {
    return validateJplOutboundMessage({
      name: 'FpErrorMsg_req' as JplCommandName,
      subCode: '00H',
      data: { FpId: fpId },
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
          : undefined,
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
    return validateJplOutboundMessage({
      name: 'FpSupTrans_req' as JplCommandName,
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

  if (normalized === 'UNLOCK_SUPERVISED_TRANSACTION') {
    return validateJplOutboundMessage({
      name: 'unlock_FpSupTrans_req' as JplCommandName,
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

  if (normalized === 'CLEAR_SUPERVISED_TRANSACTION') {
    const useExtended = Boolean(
      payload?.Vol_e ??
      payload?.vol_e ??
      payload?.Money_e ??
      payload?.money_e ??
      payload?.PaymentParameters ??
      payload?.paymentParameters,
    )

    return validateJplOutboundMessage({
      name: 'clear_FpSupTrans_req' as JplCommandName,
      subCode: useExtended ? '04H' : '00H',
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
        ...((payload?.PaymentParameters ?? payload?.paymentParameters) &&
        typeof (payload?.PaymentParameters ?? payload?.paymentParameters) ===
          'object'
          ? {
              PaymentParameters:
                payload?.PaymentParameters ?? payload?.paymentParameters,
            }
          : {}),
      },
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

    const request: Record<string, any> = {
      name: 'clear_FpSupTrans_req' as JplCommandName,
      subCode: '00H',
      data: {
        FpId: fpId,
        PosId: posId,
        TransSeqNo: transSeqNo.padStart(4, '0'),
      },
    }

    if (payload?.Money_e != null || payload?.money_e != null) {
      request.data.Money_e = String(payload?.Money_e ?? payload?.money_e)
    } else if (payload?.Money != null || payload?.money != null) {
      request.data.Money = String(payload?.Money ?? payload?.money)
    }

    return validateJplOutboundMessage(request)
  }

  return null
}

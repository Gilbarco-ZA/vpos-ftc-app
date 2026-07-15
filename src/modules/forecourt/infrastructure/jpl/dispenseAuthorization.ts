import type { DispenseAuthorizeMode } from './dispense'
import { resolveDispenseAuthorizeMode } from './dispense'
import { normalizeJplPosId } from './protocol/bootstrap'
import {
  normalizeJplCode1,
  normalizeJplDec6,
  normalizeJplDec10,
  normalizeJplId2,
  normalizeJplId2List,
  normalizeJplId2OrZero,
} from './protocol/types'

export type DispenseServiceModeFamily =
  | 'postpay_pos'
  | 'prepay_pos'
  | 'attendant_postpay'
  | 'calibration'
  | 'card_preauthorization'
  | 'banknote_prepay'
  | 'unknown'

export type DispenseServiceMode = {
  id: string
  family: DispenseServiceModeFamily
  fuellingModeGroupId?: string
  priceGroupId?: string
  validGradeIds: string[]
}

export type DispenseStartLimit = {
  type: string
  voidLimit?: string
  volumeLimit?: string
  moneyLimit?: string
  floorLimit?: string
  volumeFloorLimit?: string
}

export type DispensePreset = DispenseStartLimit

export type DispenseAuthorizationOperation =
  | {
      kind: 'standard'
      fpId: string
      posId: string
    }
  | {
      kind: 'preset'
      fpId: string
      posId: string
      preset: DispensePreset
    }
  | {
      kind: 'prepay'
      fpId: string
      posId: string
      authorizeParameters: Record<string, unknown>
      serviceMode?: DispenseServiceMode
    }
  | {
      kind: 'extended'
      fpId: string
      posId: string
      authorizeParameters: Record<string, unknown>
      serviceMode?: DispenseServiceMode
    }

const cleanObject = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>

const present = (value: unknown) => value != null && String(value).trim() !== ''

const normalizeOptionalId2 = (value: unknown) =>
  present(value) ? normalizeJplId2(value) : undefined

const normalizeOptionalFixedDecimal = (
  value: unknown,
  width: 6 | 10,
  label: string,
) => {
  if (!present(value)) return undefined
  return width === 6
    ? normalizeJplDec6(value, undefined, label)
    : normalizeJplDec10(value, undefined, label)
}

const normalizeCode1List = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => normalizeJplCode1(entry)).filter(Boolean)
    : undefined

const toBoolInt = (value: unknown) => {
  if (value == null || value === '') return undefined
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['0', 'false', 'no', 'off'].includes(normalized)) return 0
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return 1
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Number(parsed !== 0) : undefined
}

export const classifyDispenseServiceMode = (
  serviceModeId: unknown,
): DispenseServiceModeFamily => {
  const normalized = normalizeJplId2(serviceModeId)
  switch (normalized[0]) {
    case '1':
      return 'postpay_pos'
    case '2':
      return 'prepay_pos'
    case '3':
      return 'attendant_postpay'
    case '4':
      return 'calibration'
    case '5':
      return 'card_preauthorization'
    case '6':
      return 'banknote_prepay'
    default:
      return 'unknown'
  }
}

export const normalizeDispenseServiceMode = (
  value: Record<string, unknown>,
): DispenseServiceMode | undefined => {
  const serviceModeId = value.serviceModeId ?? value.smId ?? value.SmId
  if (!present(serviceModeId)) return undefined

  const id = normalizeJplId2(serviceModeId)
  const validGradeIds =
    normalizeJplId2List(
      value.validGradeIds ?? value.validGrades ?? value.ValidGrades,
    ) ?? []

  return {
    id,
    family: classifyDispenseServiceMode(id),
    fuellingModeGroupId: normalizeOptionalId2(
      value.fuellingModeGroupId ?? value.fmgId ?? value.FmgId,
    ),
    priceGroupId: normalizeOptionalId2(
      value.priceGroupId ?? value.pgId ?? value.PgId,
    ),
    validGradeIds: [...new Set(validGradeIds)],
  }
}

const normalizeStartLimit = (
  value: unknown,
  extended: boolean,
): DispenseStartLimit | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const source = value as Record<string, unknown>
  const suffix = extended ? '_e' : ''
  const pick = (
    domainKey: string,
    protocolKey: string,
    extendedDomainKey?: string,
  ) =>
    source[domainKey] ??
    (extendedDomainKey ? source[extendedDomainKey] : undefined) ??
    source[`${domainKey}${suffix}`] ??
    source[protocolKey]
  const width = extended ? 10 : 6
  const type = normalizeJplCode1(
    source.type ??
      source.startLimitType ??
      (extended ? source.startLimitTypeE : undefined) ??
      source[`startLimitType${suffix}`] ??
      source[extended ? 'StartLimitType_e' : 'StartLimitType'] ??
      '00H',
  )

  return cleanObject({
    type,
    voidLimit: normalizeOptionalFixedDecimal(
      pick(
        'voidLimit',
        extended ? 'VoidStartLimit_e' : 'VoidStartLimit',
        extended ? 'voidLimitE' : undefined,
      ),
      width,
      extended ? 'JPL VoidStartLimit_e' : 'JPL VoidStartLimit',
    ),
    volumeLimit: normalizeOptionalFixedDecimal(
      pick(
        'volumeLimit',
        extended ? 'VolumePresetLimit_e' : 'VolumePresetLimit',
        extended ? 'volumeLimitE' : undefined,
      ),
      width,
      extended ? 'JPL VolumePresetLimit_e' : 'JPL VolumePresetLimit',
    ),
    moneyLimit: normalizeOptionalFixedDecimal(
      pick(
        'moneyLimit',
        extended ? 'MoneyPresetLimit_e' : 'MoneyPresetLimit',
        extended ? 'moneyLimitE' : undefined,
      ),
      width,
      extended ? 'JPL MoneyPresetLimit_e' : 'JPL MoneyPresetLimit',
    ),
    floorLimit: normalizeOptionalFixedDecimal(
      pick(
        'floorLimit',
        extended ? 'FloorPresetLimit_e' : 'FloorPresetLimit',
        extended ? 'floorLimitE' : undefined,
      ),
      width,
      extended ? 'JPL FloorPresetLimit_e' : 'JPL FloorPresetLimit',
    ),
    volumeFloorLimit: normalizeOptionalFixedDecimal(
      pick(
        'volumeFloorLimit',
        extended ? 'VolumeFloorPresetLimit_e' : 'VolumeFloorPresetLimit',
        extended ? 'volumeFloorLimitE' : undefined,
      ),
      width,
      extended ? 'JPL VolumeFloorPresetLimit_e' : 'JPL VolumeFloorPresetLimit',
    ),
  }) as DispenseStartLimit
}

const startLimitToJpl = (
  value: DispenseStartLimit | undefined,
  extended: boolean,
) => {
  if (!value) return undefined
  return cleanObject(
    extended
      ? {
          StartLimitType_e: value.type,
          VoidStartLimit_e: value.voidLimit,
          VolumePresetLimit_e: value.volumeLimit,
          MoneyPresetLimit_e: value.moneyLimit,
          FloorPresetLimit_e: value.floorLimit,
          VolumeFloorPresetLimit_e: value.volumeFloorLimit,
        }
      : {
          StartLimitType: value.type,
          VoidStartLimit: value.voidLimit,
          VolumePresetLimit: value.volumeLimit,
          MoneyPresetLimit: value.moneyLimit,
          FloorPresetLimit: value.floorLimit,
          VolumeFloorPresetLimit: value.volumeFloorLimit,
        },
  )
}

export const normalizeDispenseAuthorizeParameters = (
  payload: Record<string, unknown>,
) => {
  const nested = payload.AuthorizePars ?? payload.authorizePars
  const source =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : payload
  const serviceMode = normalizeDispenseServiceMode(source)
  const startLimit = normalizeStartLimit(
    source.startLimit ?? source.StartLimit,
    false,
  )
  const extendedStartLimit = normalizeStartLimit(
    source.extendedStartLimit ?? source.startLimitE ?? source.StartLimit_e,
    true,
  )

  return cleanObject({
    SmId: serviceMode?.id,
    FmgId: serviceMode?.fuellingModeGroupId,
    PgId: serviceMode?.priceGroupId,
    ValidGrades: serviceMode?.validGradeIds.length
      ? serviceMode.validGradeIds
      : undefined,
    StartLimit: startLimitToJpl(startLimit, false),
    FpTransReturnData: source.fpTransReturnData ?? source.FpTransReturnData,
    LogData: source.logData ?? source.LogData,
    AutoLockId: normalizeOptionalId2(source.autoLockId ?? source.AutoLockId),
    FpGradePriceDiscounts:
      source.fpGradePriceDiscounts ?? source.FpGradePriceDiscounts,
    LockFpPrices: toBoolInt(source.lockFpPrices ?? source.LockFpPrices),
    StartLimit_e: startLimitToJpl(extendedStartLimit, true),
    FpGradePriceDiscounts_e:
      source.fpGradePriceDiscountsE ?? source.FpGradePriceDiscounts_e,
    FpTransReturnData2: source.fpTransReturnData2 ?? source.FpTransReturnData2,
    PriceLevel:
      normalizeCode1List(source.priceLevels ?? source.PriceLevel) ??
      (present(source.priceLevel ?? source.PriceLevel)
        ? normalizeJplCode1(source.priceLevel ?? source.PriceLevel)
        : undefined),
    AuthRefId: source.authRefId ?? source.AuthRefId,
    AuthRefName: source.authRefName ?? source.AuthRefName,
    TopUpMoneyLimit_e: source.topUpMoneyLimitE ?? source.TopUpMoneyLimit_e,
    TotalPreauthorizedMoneyLimit_e:
      source.totalPreauthorizedMoneyLimitE ??
      source.TotalPreauthorizedMoneyLimit_e,
  }) as Record<string, unknown>
}

const normalizePreset = (payload: Record<string, unknown>): DispensePreset => {
  const nested = payload.preset
  const source =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : payload

  return {
    type: normalizeJplCode1(
      source.type ?? source.presetType ?? source.PresetType ?? '00H',
    ),
    voidLimit: normalizeOptionalFixedDecimal(
      source.voidLimit ?? source.voidPresetLimit ?? source.VoidPresetLimit,
      6,
      'JPL VoidPresetLimit',
    ),
    volumeLimit: normalizeOptionalFixedDecimal(
      source.volumeLimit ??
        source.volumePresetLimit ??
        source.VolumePresetLimit,
      6,
      'JPL VolumePresetLimit',
    ),
    moneyLimit: normalizeOptionalFixedDecimal(
      source.moneyLimit ?? source.moneyPresetLimit ?? source.MoneyPresetLimit,
      6,
      'JPL MoneyPresetLimit',
    ),
    floorLimit: normalizeOptionalFixedDecimal(
      source.floorLimit ?? source.floorPresetLimit ?? source.FloorPresetLimit,
      6,
      'JPL FloorPresetLimit',
    ),
  }
}

export const resolveDispenseAuthorizationOperation = (args: {
  action: string
  payload?: Record<string, unknown> | null
  fpId: unknown
  posId: unknown
}): DispenseAuthorizationOperation => {
  const payload = args.payload ?? {}
  const mode: DispenseAuthorizeMode = resolveDispenseAuthorizeMode(
    args.action,
    payload,
  )
  const fpId = normalizeJplId2OrZero(args.fpId)
  const posId = normalizeJplPosId(args.posId, '01', { allowZero: true })

  if (mode === 'standard') {
    return { kind: 'standard', fpId, posId }
  }

  if (mode === 'preset') {
    return { kind: 'preset', fpId, posId, preset: normalizePreset(payload) }
  }

  const authorizeParameters = normalizeDispenseAuthorizeParameters(payload)
  const serviceMode = normalizeDispenseServiceMode(
    (payload.AuthorizePars ?? payload.authorizePars ?? payload) as Record<
      string,
      unknown
    >,
  )

  return mode === 'prepare_transaction'
    ? {
        kind: 'prepay',
        fpId,
        posId,
        authorizeParameters,
        serviceMode,
      }
    : {
        kind: 'extended',
        fpId,
        posId,
        authorizeParameters,
        serviceMode,
      }
}

export const buildJplDispenseAuthorizationEnvelope = (
  operation: DispenseAuthorizationOperation,
) => {
  if (operation.kind === 'standard') {
    return {
      name: 'authorize_Fp_req',
      subCode: '00H',
      data: { FpId: operation.fpId, PosId: operation.posId },
    }
  }

  if (operation.kind === 'preset') {
    return {
      name: 'authorize_Fp_req',
      subCode: '01H',
      data: cleanObject({
        FpId: operation.fpId,
        PosId: operation.posId,
        PresetType: operation.preset.type,
        VoidPresetLimit: operation.preset.voidLimit,
        VolumePresetLimit: operation.preset.volumeLimit,
        MoneyPresetLimit: operation.preset.moneyLimit,
        FloorPresetLimit: operation.preset.floorLimit,
      }),
    }
  }

  return {
    name:
      operation.kind === 'prepay' ? 'prepare_Trans_req' : 'authorize_Fp_req',
    subCode: operation.kind === 'prepay' ? '01H' : '02H',
    data: {
      FpId: operation.fpId,
      PosId: operation.posId,
      AuthorizePars: operation.authorizeParameters,
    },
  }
}

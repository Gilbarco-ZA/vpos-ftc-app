import { createHash } from 'node:crypto'

export type NormalizedJplWashTransaction = {
  wpId?: string
  transSeqNo?: string
  posId?: string
  smId?: string
  transLockId?: string
  money?: string
  washProgramNo?: string
  fcWashId?: string
  authId?: string
  startLimit?: string
  startDate?: string
  startTime?: string
  finishDate?: string
  finishTime?: string
  terminationStatus: {
    value?: number | string | null
    terminatedWithError: boolean
    authorizationTimeout: boolean
    washingTimeout: boolean
    raw?: unknown
  }
  transErrorCode?: string
  washOptions: string[]
  transReturnData: unknown[]
  transReturnData2: unknown[]
  clearRequest: {
    name: 'clear_WpUnSupTrans_req'
    subCode: '00H'
    data: {
      WpId: string
      PosId: string
      TransSeqNo: string
      Money: string
    }
  } | null
  reviewStatus: 'pending_clear' | 'zero_transaction_review' | 'needs_review'
  clearStatus: 'pending_clear' | 'blocked'
  reason?: string
  sourceHash: string
  payloadJson: Record<string, unknown>
}

export type NormalizedJplWashBufferEntry = {
  wpId?: string
  transSeqNo?: string
  smId?: string
  transLockId?: string
  money?: string
  hasError: boolean
  sourceHash: string
  payloadJson: Record<string, unknown>
}

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const first = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return undefined
}

const normalizeDigits = (value: unknown, width?: number) => {
  const text = first(value)
  if (!text) return undefined
  if (!/^\d+$/.test(text)) return text
  return width ? text.padStart(width, '0') : text
}

const normalizeId2 = (value: unknown) => normalizeDigits(value, 2)
const normalizeDec4 = (value: unknown) => normalizeDigits(value, 4)

const enumLabel = (value: any) => {
  const object = asRecord(value)
  const enumObject = asRecord(object.enum)
  const rawValue = first(object.value)
  if (rawValue) {
    const match = Object.entries(enumObject).find(
      ([, enumValue]) => String(enumValue) === rawValue,
    )
    if (match?.[0]) return match[0]
  }
  return Object.keys(enumObject)[0]
}

const bitActive = (value: any, ...names: string[]) => {
  const object = asRecord(value)
  const bits = asRecord(object.bits)
  for (const name of names) {
    if (bits[name]) return true
    const key = Object.keys(bits).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    )
    if (key && bits[key]) return true
  }
  const raw = Number(object.value ?? value)
  if (!Number.isFinite(raw)) return false
  if (names.some((name) => name === 'terminatedWithError'))
    return Boolean(raw & 1)
  if (names.some((name) => name === 'authorizationTimeout'))
    return Boolean(raw & 8)
  if (names.some((name) => name === 'washingTimeout')) return Boolean(raw & 16)
  if (names.some((name) => name === 'ErrorTrans')) return Boolean(raw & 2)
  return false
}

const stableHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value ?? {}))
    .digest('hex')

const moneyIsZero = (money: string | undefined) =>
  money != null && /^0+$/.test(String(money).replace(/\D/g, ''))

const normalizePars = (payload: any) => {
  const data = asRecord(payload)
  return asRecord(
    data.WpTransPars ??
      data.TransPars ??
      data.WpUnSupTransPars ??
      data.transPars ??
      data,
  )
}

const normalizeWashOptions = (value: unknown) =>
  asArray(value)
    .map((entry) => first((entry as any)?.value, entry))
    .filter(Boolean) as string[]

export function normalizeJplWashTransaction(
  payload: unknown,
  subCode = '00H',
  fallbackPosId?: unknown,
): NormalizedJplWashTransaction {
  const data = asRecord(payload)
  const pars = normalizePars(data)
  const wpId = normalizeId2(first(data.WpId, pars.WpId, data.wpId))
  const transSeqNo = normalizeDec4(
    first(
      data.WpTransSeqNo,
      data.TransSeqNo,
      pars.WpTransSeqNo,
      pars.TransSeqNo,
      data.transSeqNo,
    ),
  )
  const posId = normalizeId2(first(data.PosId, pars.PosId, fallbackPosId))
  const smId = normalizeId2(
    first(data.WpSmId, data.SmId, pars.WpSmId, pars.SmId),
  )
  const transLockId = normalizeId2(
    first(data.TransLockId, data.WpTransLockId, pars.TransLockId),
  )
  const money = normalizeDigits(first(pars.Money, data.Money, data.money))
  const terminationRaw =
    data.WpTransTerminationStatus ??
    data.TransTerminationStatus ??
    pars.WpTransTerminationStatus ??
    pars.TransTerminationStatus
  const terminationStatus = {
    value: asRecord(terminationRaw).value ?? terminationRaw ?? null,
    terminatedWithError: bitActive(
      terminationRaw,
      'terminated_with_error',
      'TerminatedWithError',
      'terminatedWithError',
    ),
    authorizationTimeout: bitActive(
      terminationRaw,
      'authorization_timeout',
      'Authorization_timeout',
      'authorizationTimeout',
    ),
    washingTimeout: bitActive(
      terminationRaw,
      'washing_timeout',
      'Washing_timeout',
      'washingTimeout',
    ),
    raw: terminationRaw,
  }

  const washOptions = normalizeWashOptions(
    pars.WpTransWashOptions ?? data.WpTransWashOptions,
  )
  const transReturnData = asArray(
    pars.WpTransReturnData ?? data.WpTransReturnData,
  )
  const transReturnData2 = asArray(
    pars.WpTransReturnData2 ?? data.WpTransReturnData2,
  )
  const transErrorRaw =
    pars.WpTransErrorCode ?? data.WpTransErrorCode ?? data.TransErrorCode
  const transErrorCode = first(
    asRecord(transErrorRaw).value,
    enumLabel(transErrorRaw),
    transErrorRaw,
  )

  const clearRequest =
    wpId && posId && transSeqNo && money != null
      ? {
          name: 'clear_WpUnSupTrans_req' as const,
          subCode: '00H' as const,
          data: {
            WpId: wpId,
            PosId: posId,
            TransSeqNo: transSeqNo,
            Money: money,
          },
        }
      : null

  const reason = !wpId
    ? 'missing WpId'
    : !transSeqNo
      ? 'missing WpTransSeqNo/TransSeqNo'
      : !posId
        ? 'missing PosId'
        : money == null
          ? 'missing Money'
          : undefined

  const reviewStatus = reason
    ? 'needs_review'
    : moneyIsZero(money)
      ? 'zero_transaction_review'
      : 'pending_clear'

  return {
    wpId,
    transSeqNo,
    posId,
    smId,
    transLockId,
    money,
    washProgramNo: normalizeId2(first(pars.WashProgramNo, data.WashProgramNo)),
    fcWashId: normalizeId2(first(pars.FcWashId, data.FcWashId)),
    authId: first(pars.AuthId, data.AuthId),
    startLimit: first(pars.WpStartLimit, data.WpStartLimit),
    startDate: first(pars.StartDate, data.StartDate),
    startTime: first(pars.StartTime, data.StartTime),
    finishDate: first(pars.FinishDate, data.FinishDate),
    finishTime: first(pars.FinishTime, data.FinishTime),
    terminationStatus,
    transErrorCode,
    washOptions,
    transReturnData,
    transReturnData2,
    clearRequest,
    reviewStatus,
    clearStatus: clearRequest ? 'pending_clear' : 'blocked',
    reason,
    sourceHash: stableHash({ subCode, data }),
    payloadJson: data,
  }
}

export function normalizeJplWashStatusBuffer(
  payload: unknown,
  subCode = '00H',
): NormalizedJplWashBufferEntry[] {
  const data = asRecord(payload)
  const wpId = normalizeId2(first(data.WpId, data.wpId))
  const entries = asArray(
    data.WpTransInUnsBuffer ??
      data.WpTransInUnSupBuffer ??
      data.TransInUnSupBuffer ??
      data.unsupervisedBuffer,
  )

  return entries.map((entry) => {
    const item = asRecord(entry)
    const transSeqNo = normalizeDec4(
      first(item.WpTransSeqNo, item.TransSeqNo, item.transSeqNo),
    )
    const payloadJson = { subCode, wpId, ...item }
    return {
      wpId,
      transSeqNo,
      smId: normalizeId2(first(item.WpSmId, item.SmId)),
      transLockId: normalizeId2(first(item.TransLockId, item.WpTransLockId)),
      money: normalizeDigits(first(item.Money, item.money)),
      hasError: bitActive(item.WpTransInfoMask, 'ErrorTrans'),
      sourceHash: stableHash(payloadJson),
      payloadJson,
    }
  })
}

import { parseDate } from '@/src/shared/utils/dates'

type NormalizedPumpStatus = {
  fpId: number
  status?: string | null
  data?: any
}

type NormalizedPriceSetStatus = {
  priceSetId: number
  effectiveAt?: Date | null
  data?: any
}

type NormalizedPriceSet = {
  priceSetId: number
  effectiveAt?: Date | null
  priceGroupIds: number[]
  gradeIds: number[]
  // price matrix: [groupIndex][gradeIndex] = price
  prices: Array<{ priceGroupId: number; gradeId: number; price: number | null }>
  data?: any
}

export type NormalizedTransaction = {
  fpId?: number | null
  isSupported: boolean
  transSeqNo?: number | null
  smId?: number | null
  transLockId?: number | null
  transInfoMask?: number | null
  fcGradeId?: number | null
  moneyDue?: number | null
  volume?: number | null
  sourceMode?: 'supervised' | 'unsupervised'
  isSupervised?: boolean
  raw: any
}

export type ForecourtNormalization = {
  pumpStatus?: NormalizedPumpStatus | null
  priceSetStatus?: NormalizedPriceSetStatus | null
  priceSet?: NormalizedPriceSet | null
  transactions?: NormalizedTransaction[] | null
}

const num = (v: any): number | null => {
  if (v == null) return null
  if (typeof v === 'string' && !v.trim()) return null

  // doms-pos-jpl uses BIT objects like { value: 3, bits: {...} }
  if (v && typeof v === 'object' && 'value' in v) {
    v = (v as any).value
  }

  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

const int = (v: any): number | null => {
  const n = num(v)
  if (n == null) return null
  if (n <= 0) return null
  return Math.trunc(n)
}

const getAny = (p: any, keys: string[]) => {
  for (const k of keys) {
    if (p && Object.prototype.hasOwnProperty.call(p, k)) return (p as any)[k]
  }
  return undefined
}

function extractFpId(payload: any): number | null {
  const p = payload ?? {}
  const candidates = [
    getAny(p, ['FpId', 'fpId', 'fp_id', 'FpID']),
    getAny(p, ['FpNumber', 'fpNumber', 'fp_number']),
    getAny(p, ['pumpId', 'pump_id', 'pumpNumber', 'pump_number']),
    getAny(p, ['FuellingPoint', 'fuellingPoint', 'FuelingPoint']),
    getAny(p, ['Fp', 'fp']),
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const nested = getAny(c, [
        'FpId',
        'fpId',
        'FpNumber',
        'fpNumber',
        'id',
        'number',
      ])
      const nestedInt = int(nested)
      if (nestedInt != null) return nestedInt
    }
    const n = int(c)
    if (n != null) return n
  }
  return null
}

function extractFpIdFromEventType(eventType: string): number | null {
  const matches = String(eventType ?? '').match(/(\d+)/g)
  if (!matches?.length) return null
  for (const token of matches) {
    const parsed = int(token)
    if (parsed != null) return parsed
  }
  return null
}

function normalizePumpStatus(
  eventType: string,
  payload: any,
): NormalizedPumpStatus | null {
  if (
    !(
      eventType.startsWith('FpStatus_') || eventType.startsWith('FpStatus_resp')
    )
  )
    return null
  const fpId = extractFpId(payload) ?? extractFpIdFromEventType(eventType)
  if (fpId == null) return null

  const status = (getAny(payload, [
    'FpMainState',
    'fpMainState',
    'FpState',
    'status',
    'state',
  ]) ?? null) as any

  return {
    fpId,
    status:
      typeof status === 'string'
        ? status
        : status != null
          ? String(status)
          : null,
    data: payload ?? {},
  }
}

function normalizePriceSetStatus(
  eventType: string,
  payload: any,
): NormalizedPriceSetStatus | null {
  if (!eventType.startsWith('FcPriceSetStatus_resp_')) return null

  const priceSetId = int(
    getAny(payload, ['FcPriceSetId', 'priceSetId', 'fcPriceSetId']),
  )
  if (priceSetId == null) return null

  const effectiveAt =
    parseDate(
      getAny(payload, [
        'FcPriceSetDateAndTime',
        'effectiveAt',
        'fcPriceSetDateAndTime',
      ]),
    ) ?? null

  return { priceSetId, effectiveAt, data: payload ?? {} }
}

function normalizePriceSet(
  eventType: string,
  payload: any,
): NormalizedPriceSet | null {
  if (!eventType.startsWith('FcPriceSet_resp_')) return null

  const priceSetId = int(
    getAny(payload, ['FcPriceSetId', 'priceSetId', 'fcPriceSetId']),
  )
  if (priceSetId == null) return null

  // doms-pos-jpl generated payloads commonly follow the DPP.ini structure:
  // NoFcPriceGroups{FcPriceGroupId}, NoFcGrades{FcGradeId}, NoFcPriceGroups{NoFcGrades{Price}}
  const groupsRaw = getAny(payload, [
    'FcPriceGroupId',
    'priceGroups',
    'FcPriceGroups',
  ])
  const gradesRaw = getAny(payload, ['FcGradeId', 'grades', 'FcGrades'])

  const groupIds: number[] = Array.isArray(groupsRaw)
    ? groupsRaw
        .map((x) => int(getAny(x, ['FcPriceGroupId', 'id', 'value']) ?? x))
        .filter((x): x is number => x != null)
    : []

  const gradeIds: number[] = Array.isArray(gradesRaw)
    ? gradesRaw
        .map((x) => int(getAny(x, ['FcGradeId', 'id', 'value']) ?? x))
        .filter((x): x is number => x != null)
    : []

  // matrix can appear as Price or prices array-of-arrays
  const pricesOut: Array<{
    priceGroupId: number
    gradeId: number
    price: number | null
  }> = []

  const matrix = getAny(payload, [
    'FcPriceGroups',
    'fcPriceGroups',
    'Price',
    'prices',
    'Prices',
  ])
  if (Array.isArray(matrix) && groupIds.length && gradeIds.length) {
    // matrix is expected as group-major, each group has grade-major list
    for (let gi = 0; gi < groupIds.length; gi++) {
      const row = matrix[gi]
      if (!Array.isArray(row)) continue
      for (let gj = 0; gj < gradeIds.length; gj++) {
        const priceVal = num(
          getAny(row[gj], ['Price', 'price', 'value']) ?? row[gj],
        )
        pricesOut.push({
          priceGroupId: groupIds[gi],
          gradeId: gradeIds[gj],
          price: priceVal,
        })
      }
    }
  } else if (
    Array.isArray(matrix) &&
    !Array.isArray(matrix[0]) &&
    groupIds.length &&
    gradeIds.length
  ) {
    // flat array; interpret as group-major contiguous
    const flat = matrix
    for (let i = 0; i < groupIds.length * gradeIds.length; i++) {
      const gi = Math.floor(i / gradeIds.length)
      const gj = i % gradeIds.length
      const priceVal = num(
        getAny(flat[i], ['Price', 'price', 'value']) ?? flat[i],
      )
      if (groupIds[gi] != null && gradeIds[gj] != null) {
        pricesOut.push({
          priceGroupId: groupIds[gi],
          gradeId: gradeIds[gj],
          price: priceVal,
        })
      }
    }
  }

  const effectiveAt =
    parseDate(
      getAny(payload, [
        'FcPriceSetDateAndTime',
        'fcPriceSetDateAndTime',
        'PriceSetActivationDateAndTime',
        'priceSetActivationDateAndTime',
      ]),
    ) ?? null

  return {
    priceSetId,
    effectiveAt,
    priceGroupIds: groupIds,
    gradeIds,
    prices: pricesOut,
    data: payload ?? {},
  }
}

function normalizeTransactions(
  eventType: string,
  payload: any,
): NormalizedTransaction[] | null {
  const isSup =
    eventType.startsWith('FpSupTransBufStatus_resp_') ||
    eventType.startsWith('FpSupTrans_resp_')
  const isUnSup =
    eventType.startsWith('FpUnSupTransBufStatus_resp_') ||
    eventType.startsWith('FpUnSupTrans_resp_')

  if (!isSup && !isUnSup) return null

  const fpId = extractFpId(payload) ?? extractFpIdFromEventType(eventType)

  const inferredSourceMode: 'supervised' | 'unsupervised' = isSup
    ? 'supervised'
    : 'unsupervised'

  const payloadSourceMode =
    payload?.sourceMode === 'supervised' ||
    payload?.sourceMode === 'unsupervised'
      ? payload.sourceMode
      : inferredSourceMode

  const payloadIsSupervised =
    payload?.isSupervised === true || payloadSourceMode === 'supervised'

  // Individual transaction response shape at root
  const rootSeq = num(getAny(payload, ['TransSeqNo', 'transSeqNo']))
  const rootTransPars = payload?.TransPars ?? payload?.transPars ?? {}
  const rootMoney = num(
    getAny(payload, [
      'MoneyDue_e',
      'Money_e',
      'MoneyDue',
      'Money',
      'moneyDue',
      'amount',
    ]) ??
      getAny(rootTransPars, ['MoneyDue_e', 'Money_e', 'MoneyDue', 'Money']) ??
      null,
  )
  const rootVol = num(
    getAny(payload, ['Vol_e', 'Vol', 'Volume', 'volume']) ??
      getAny(rootTransPars, ['Vol_e', 'Vol', 'Volume']) ??
      null,
  )

  if (rootSeq != null || rootMoney != null || rootVol != null) {
    return [
      {
        fpId,
        isSupported: isSup,
        transSeqNo: rootSeq ?? null,
        smId: num(getAny(payload, ['SmId', 'smId'])) ?? null,
        transLockId:
          num(getAny(payload, ['TransLockId', 'transLockId'])) ?? null,
        transInfoMask:
          num(
            getAny(payload, [
              'TransInfoMask',
              'TransInfoFlags',
              'transInfoMask',
              'transInfoFlags',
            ]),
          ) ?? null,
        fcGradeId: num(getAny(payload, ['FcGradeId', 'fcGradeId'])) ?? null,
        moneyDue: rootMoney ?? null,
        volume: rootVol ?? null,

        sourceMode: payloadSourceMode,
        isSupervised: payloadIsSupervised,

        raw: payload ?? {},
      },
    ]
  }

  const list = getAny(payload, [
    'TransInSupBuffer',
    'TransInUnSupBuffer',
    'Trans',
    'transactions',
    'FpTrans',
  ])

  // Common doms-pos-jpl decode: arrays are placed on their element names, not on count name.
  // For these messages, we usually see a property that is an array of objects containing:
  // TransSeqNo, SmId, TransLockId, TransInfoMask, MoneyDue, Vol
  let txArr: any[] = []

  if (Array.isArray(list)) txArr = list

  // Fallback for decoder-specific shapes: take the first object array.
  if (!txArr.length) {
    for (const value of Object.values(payload ?? {})) {
      if (
        Array.isArray(value) &&
        value.length &&
        typeof value[0] === 'object'
      ) {
        txArr = value as any[]
        break
      }
    }
  }

  if (!txArr.length) return []

  return txArr.map((t) => {
    const moneyDue = num(
      getAny(t, [
        'MoneyDue_e',
        'Money_e',
        'MoneyDue',
        'Money',
        'moneyDue',
        'amount',
      ]) ?? null,
    )
    const volume = num(getAny(t, ['Vol_e', 'Vol', 'Volume', 'volume']) ?? null)

    const entrySourceMode =
      t?.sourceMode === 'supervised' || t?.sourceMode === 'unsupervised'
        ? t.sourceMode
        : payloadSourceMode

    const entryIsSupervised =
      t?.isSupervised === true || entrySourceMode === 'supervised'

    return {
      fpId,
      isSupported: isSup,
      transSeqNo: num(getAny(t, ['TransSeqNo', 'transSeqNo'])) ?? null,
      smId: num(getAny(t, ['SmId', 'smId'])) ?? null,
      transLockId: num(getAny(t, ['TransLockId', 'transLockId'])) ?? null,
      transInfoMask:
        num(
          getAny(t, [
            'TransInfoMask',
            'TransInfoFlags',
            'transInfoMask',
            'transInfoFlags',
          ]),
        ) ?? null,
      fcGradeId: num(getAny(t, ['FcGradeId', 'fcGradeId'])) ?? null,
      moneyDue,
      volume,
      sourceMode: entrySourceMode,
      isSupervised: entryIsSupervised,
      raw: t ?? {},
    }
  })
}

export function normalizeForecourtEvent(
  eventType: string,
  payload: any,
): ForecourtNormalization {
  const pumpStatus = normalizePumpStatus(eventType, payload)
  const priceSetStatus = normalizePriceSetStatus(eventType, payload)
  const priceSet = normalizePriceSet(eventType, payload)
  const transactions = normalizeTransactions(eventType, payload)

  return {
    pumpStatus,
    priceSetStatus,
    priceSet,
    transactions,
  }
}

import type { PriceBank, PriceEntry } from './contracts'

export const ZERO_FC_DATE_TIME = '00000000000000'

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

const unwrapValue = (value: any) => {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value
  }
  return value
}

export const toId2String = (value: unknown, fallback = '00') => {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim().padStart(2, '0')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return String(Math.max(0, Math.trunc(parsed))).padStart(2, '0')
}

const toRequestData = (response: any) => response?.data ?? response ?? {}

const formatFcDateTime = (date: Date) => {
  const yyyy = String(date.getFullYear()).padStart(4, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`
}

export const toFcDateTime = (value: unknown): string => {
  if (value == null || value === '') return ZERO_FC_DATE_TIME
  if (value instanceof Date) return formatFcDateTime(value)

  const text = String(value).trim()
  if (!text) return ZERO_FC_DATE_TIME
  if (/^\d{14}$/.test(text)) return text
  if (/^\d{8}$/.test(text)) return `${text}000000`

  const localDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (localDateMatch) {
    return `${localDateMatch[1]}${localDateMatch[2]}${localDateMatch[3]}000000`
  }

  const localDateTimeMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (localDateTimeMatch) {
    const [, yyyy, mm, dd, hh, mi, ss = '00'] = localDateTimeMatch
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`
  }

  const normalized =
    text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid effective date/time: ${text}`)
  }
  return formatFcDateTime(date)
}

export const normalizePriceValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(Math.trunc(value))
    return String(Math.round(value * 100))
  }

  const text = String(value ?? '').trim()
  if (!text) throw new Error('Missing price value')
  if (/^\d+$/.test(text)) return text

  const normalized = text.replace(/,/g, '.')
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return String(Math.round(Number(normalized) * 100))
  }

  throw new Error(`Invalid price value: ${text}`)
}

const asIdList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input
    .map((item) =>
      toId2String(
        pick(item, ['FcPriceGroupId', 'FcGradeId', 'id', 'value']) ?? item,
        '',
      ),
    )
    .filter(Boolean)
}

const asPriceMatrix = (input: unknown): string[][] => {
  if (!Array.isArray(input)) return []
  return input.map((row) => {
    if (!Array.isArray(row)) return []
    return row.map((cell) => {
      const raw = unwrapValue(
        pick(cell, ['Price_e', 'Price', 'price', 'value']) ?? cell,
      )
      return String(raw ?? '').trim()
    })
  })
}

export const extractEntries = (
  payload: Record<string, unknown>,
): PriceEntry[] => {
  const listCandidates = [
    payload.entries,
    payload.gradePrices,
    payload.prices,
    payload.items,
  ]

  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate)) continue
    const entries: PriceEntry[] = []

    for (const item of candidate) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const rawPrice =
        obj.price ?? obj.price_e ?? obj.pricePerLiter ?? obj.amount ?? obj.value
      if (rawPrice == null) continue

      entries.push({
        productId:
          obj.productId != null ? toId2String(obj.productId, '') : undefined,
        gradeId:
          obj.gradeId != null
            ? toId2String(obj.gradeId, '')
            : obj.fcGradeId != null
              ? toId2String(obj.fcGradeId, '')
              : undefined,
        priceGroupId:
          obj.priceGroupId != null
            ? toId2String(obj.priceGroupId, '')
            : obj.fcPriceGroupId != null
              ? toId2String(obj.fcPriceGroupId, '')
              : undefined,
        price: normalizePriceValue(rawPrice),
      })
    }

    if (entries.length) return entries
  }

  const rawPrice =
    payload.price ??
    payload.price_e ??
    payload.pricePerLiter ??
    payload.amount ??
    payload.value
  if (rawPrice == null) return []

  return [
    {
      productId:
        payload.productId != null
          ? toId2String(payload.productId, '')
          : undefined,
      gradeId:
        payload.gradeId != null
          ? toId2String(payload.gradeId, '')
          : payload.fcGradeId != null
            ? toId2String(payload.fcGradeId, '')
            : undefined,
      priceGroupId:
        payload.priceGroupId != null
          ? toId2String(payload.priceGroupId, '')
          : payload.fcPriceGroupId != null
            ? toId2String(payload.fcPriceGroupId, '')
            : undefined,
      price: normalizePriceValue(rawPrice),
    },
  ]
}

export const extractExplicitPriceBank = (
  payload: Record<string, unknown>,
): PriceBank | null => {
  const fcPriceSetId = toId2String(
    payload.fcPriceSetId ?? payload.FcPriceSetId,
    '',
  )
  const fcPriceGroupIds = asIdList(
    payload.fcPriceGroupIds ?? payload.FcPriceGroupId,
  )
  const fcGradeIds = asIdList(payload.fcGradeIds ?? payload.FcGradeId)
  const fcPriceGroups = asPriceMatrix(
    payload.fcPriceGroups ?? payload.FcPriceGroups,
  )

  if (
    !fcPriceSetId ||
    !fcPriceGroupIds.length ||
    !fcGradeIds.length ||
    !fcPriceGroups.length
  ) {
    return null
  }

  return {
    fcPriceSetId,
    fcPriceGroupIds,
    fcGradeIds,
    fcPriceGroups,
    fcPriceSetDateAndTime:
      String(
        payload.fcPriceSetDateAndTime ??
          payload.FcPriceSetDateAndTime ??
          payload.PriceSetActivationDateAndTime ??
          '',
      ).trim() || undefined,
    userId: String(payload.userId ?? payload.UserId ?? '').trim() || undefined,
  }
}

export const toPriceBank = (response: any): PriceBank | null => {
  const data = toRequestData(response)
  const fcPriceSetId = toId2String(
    pick(data, ['FcPriceSetId', 'fcPriceSetId', 'priceSetId']),
    '',
  )
  const fcPriceGroupIds = asIdList(
    pick(data, ['FcPriceGroupId', 'fcPriceGroupId', 'priceGroups']),
  )
  const fcGradeIds = asIdList(pick(data, ['FcGradeId', 'fcGradeId', 'grades']))
  const fcPriceGroups = asPriceMatrix(
    pick(data, ['FcPriceGroups', 'fcPriceGroups', 'Price', 'prices', 'Prices']),
  )

  if (
    !fcPriceSetId ||
    !fcPriceGroupIds.length ||
    !fcGradeIds.length ||
    !fcPriceGroups.length
  ) {
    return null
  }

  return {
    fcPriceSetId,
    fcPriceGroupIds,
    fcGradeIds,
    fcPriceGroups,
    fcPriceSetDateAndTime:
      String(
        pick(data, [
          'FcPriceSetDateAndTime',
          'fcPriceSetDateAndTime',
          'PriceSetActivationDateAndTime',
        ]) ?? '',
      ).trim() || undefined,
    userId: String(pick(data, ['UserId', 'userId']) ?? '').trim() || undefined,
  }
}

export type PendingPriceSet = {
  fcPriceSetId: string
  activationAt: string
}

export const extractPendingPriceSets = (response: any): PendingPriceSet[] => {
  const data = toRequestData(response)
  const pending = pick(data, [
    'FcPendingPriceSet',
    'fcPendingPriceSet',
    'pending',
  ])
  if (!Array.isArray(pending)) return []

  return pending
    .map((item) => {
      const fcPriceSetId = toId2String(
        pick(item, ['FcPriceSetId', 'fcPriceSetId', 'priceSetId']),
        '',
      )
      const activationAt = String(
        pick(item, [
          'PriceSetActivationDateAndTime',
          'priceSetActivationDateAndTime',
          'activationAt',
        ]) ?? '',
      ).trim()
      if (!fcPriceSetId || !activationAt) return null
      return { fcPriceSetId, activationAt }
    })
    .filter((item): item is PendingPriceSet => Boolean(item))
}

export const mergePriceBank = (
  base: PriceBank,
  entries: PriceEntry[],
): PriceBank => {
  const fcGradeIds = [...base.fcGradeIds]
  const fcPriceGroupIds = [...base.fcPriceGroupIds]
  const fcPriceGroups = base.fcPriceGroups.map((row) => [...row])

  while (fcPriceGroups.length < fcPriceGroupIds.length) {
    fcPriceGroups.push(Array(fcGradeIds.length).fill('0'))
  }
  for (let rowIndex = 0; rowIndex < fcPriceGroups.length; rowIndex++) {
    const row = fcPriceGroups[rowIndex] ?? []
    while (row.length < fcGradeIds.length) row.push('0')
    fcPriceGroups[rowIndex] = row
  }

  for (const entry of entries) {
    const targetGradeId = entry.gradeId || entry.productId
    if (!targetGradeId) {
      throw new Error(
        'Each scheduled price entry must include productId or gradeId',
      )
    }

    const gradeIndex = fcGradeIds.findIndex(
      (gradeId) => gradeId === targetGradeId,
    )
    if (gradeIndex < 0) {
      throw new Error(
        `Grade ${targetGradeId} is not present in the active DOMS price bank`,
      )
    }

    const groupIndexes = entry.priceGroupId
      ? fcPriceGroupIds
          .map((groupId, index) =>
            groupId === entry.priceGroupId ? index : -1,
          )
          .filter((index) => index >= 0)
      : fcPriceGroupIds.map((_, index) => index)

    if (!groupIndexes.length) {
      throw new Error(
        `Price group ${entry.priceGroupId} is not present in the active DOMS price bank`,
      )
    }

    for (const groupIndex of groupIndexes) {
      if (!fcPriceGroups[groupIndex]) {
        fcPriceGroups[groupIndex] = Array(fcGradeIds.length).fill('0')
      }
      fcPriceGroups[groupIndex][gradeIndex] = entry.price
    }
  }

  return {
    fcPriceSetId: base.fcPriceSetId,
    fcPriceGroupIds,
    fcGradeIds,
    fcPriceGroups,
    fcPriceSetDateAndTime: base.fcPriceSetDateAndTime,
    userId: base.userId,
  }
}

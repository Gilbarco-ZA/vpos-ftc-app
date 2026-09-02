import {
  scaleJplMoney,
  scaleJplVolume,
} from '@/src/modules/forecourt/infrastructure/jplValueScaling'

type TxLike = {
  raw?: any
  volume?: number | null
  moneyDue?: number | null
}

const RAW_VOLUME_KEYS = [
  'Vol',
  'VolE',
  'Volume',
  'VolumeE',
  'VolumeLiters',
  'Quantity',
  'Qty',
]

const RAW_MONEY_KEYS = [
  'MoneyDue',
  'Money',
  'MoneyE',
  'Amount',
  'TotalAmount',
  'MoneyTotal',
  'Total',
  'Sum',
]

const RAW_UNIT_PRICE_KEYS = [
  'Price_e',
  'PriceE',
  'Price',
  'UnitPrice',
  'UnitPrice_e',
  'PricePerLiter',
]

const normalizeKey = (value: string) =>
  value.replace(/[^a-z0-9]/gi, '').toLowerCase()

const unwrapValue = (value: any): any => {
  if (value == null) return value
  if (typeof value === 'object') {
    if ('data' in value) return unwrapValue((value as any).data)
    if ('value' in value) return unwrapValue((value as any).value)
  }
  return value
}

const isValidDecimalSetting = (value: number | undefined): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 4

export const scaleByDecimals = (
  input: unknown,
  decimals: number | undefined,
): number | null => {
  if (!isValidDecimalSetting(decimals)) return null
  const raw = String(input ?? '')
  const sanitized = raw.replace(/[^0-9]/g, '')
  if (!sanitized.length) return null
  const padded = sanitized.padStart(decimals + 1, '0')
  if (decimals === 0) return Number(padded)
  const splitIndex = padded.length - decimals
  const head = padded.slice(0, splitIndex) || '0'
  const tail = padded.slice(splitIndex)
  return Number(`${head}.${tail}`)
}

const extractRawTransactionField = (
  tx: TxLike | null | undefined,
  candidateKeys: string[],
): any => {
  if (!tx?.raw || typeof tx.raw !== 'object') return undefined
  const normalized = candidateKeys.map(normalizeKey)
  const visited = new Set<any>()
  const queue: any[] = [tx.raw]

  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue
    if (visited.has(current)) continue
    visited.add(current)

    if (Array.isArray(current)) {
      for (const item of current) {
        if (item && typeof item === 'object') queue.push(item)
      }
      continue
    }

    for (const key of Object.keys(current)) {
      const value = (current as any)[key]
      if (normalized.includes(normalizeKey(key))) {
        const unwrapped = unwrapValue(value)
        if (unwrapped !== undefined && unwrapped !== null && unwrapped !== '')
          return unwrapped
      }
      if (value && typeof value === 'object') queue.push(value)
    }
  }

  return undefined
}

export const resolveTransactionVolume = (
  tx: TxLike | null | undefined,
  countryCode: string,
  volumeDecimals?: number,
): number | null => {
  const raw = extractRawTransactionField(tx, RAW_VOLUME_KEYS)

  if (isValidDecimalSetting(volumeDecimals)) {
    if (raw !== undefined) {
      const scaled = scaleByDecimals(raw, volumeDecimals)
      if (scaled != null) return scaled
    }
    if (tx?.volume != null) {
      const scaled = scaleByDecimals(tx.volume, volumeDecimals)
      if (scaled != null) return scaled
    }
  }

  if (raw !== undefined) {
    const scaled = scaleJplVolume(raw, countryCode, volumeDecimals)
    if (scaled != null) return scaled
  }

  if (tx?.volume != null) {
    const scaled = scaleJplVolume(tx.volume, countryCode, volumeDecimals)
    if (scaled != null) return scaled
  }
  return null
}

export const resolveTransactionAmount = (
  tx: TxLike | null | undefined,
  countryCode: string,
  moneyDecimals?: number,
): number | null => {
  const raw = extractRawTransactionField(tx, RAW_MONEY_KEYS)

  if (isValidDecimalSetting(moneyDecimals)) {
    if (raw !== undefined) {
      const scaled = scaleByDecimals(raw, moneyDecimals)
      if (scaled != null) return scaled
    }
    if (tx?.moneyDue != null) {
      const scaled = scaleByDecimals(tx.moneyDue, moneyDecimals)
      if (scaled != null) return scaled
    }
  }

  if (raw !== undefined) {
    const scaled = scaleJplMoney(raw, countryCode, moneyDecimals)
    if (scaled != null) return scaled
  }
  if (tx?.moneyDue != null) {
    const scaled = scaleJplMoney(tx.moneyDue, countryCode, moneyDecimals)
    if (scaled != null) return scaled
  }
  return null
}

/**
 * DOMS exposes the dispenser price on a transaction as Price_e/Price. This is
 * intentionally kept separate from amount/volume derivation so country policy
 * can decide when the controller price is authoritative (currently Tanzania).
 */
export const resolveTransactionUnitPrice = (
  tx: TxLike | null | undefined,
  unitPriceDecimals?: number,
): number | null => {
  const raw = extractRawTransactionField(tx, RAW_UNIT_PRICE_KEYS)
  if (raw === undefined) return null

  if (isValidDecimalSetting(unitPriceDecimals)) {
    const scaled = scaleByDecimals(raw, unitPriceDecimals)
    if (scaled != null) return scaled
  }

  const numeric = Number(unwrapValue(raw))
  return Number.isFinite(numeric) ? numeric : null
}

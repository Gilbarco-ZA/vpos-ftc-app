export const JPL_ID_ZERO = '00'
export const JPL_FC_DATE_TIME_ZERO = '00000000000000'

const toTrimmedString = (value: unknown) => String(value ?? '').trim()

export const normalizeJplFixedDecimal = (
  value: unknown,
  width: number,
  label = `JPL DEC${width}`,
  fallback?: unknown,
) => {
  if (!Number.isInteger(width) || width < 1) {
    throw new Error('JPL decimal width must be a positive integer')
  }

  const raw = toTrimmedString(value)
  const selected = raw || toTrimmedString(fallback)
  if (!/^\d+$/.test(selected)) {
    throw new Error(`${label} must be a numeric value`)
  }
  if (selected.length > width) {
    throw new Error(`${label} must contain at most ${width} digits`)
  }

  return selected.padStart(width, '0')
}

const parseBoundedInteger = (
  value: unknown,
  label: string,
  min: number,
  max: number,
) => {
  const raw = toTrimmedString(value)
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be a numeric value`)
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be numeric`)
  }

  const whole = Math.trunc(parsed)
  if (whole < min || whole > max) {
    throw new Error(`${label} must be between ${min} and ${max}`)
  }

  return whole
}

export const normalizeJplId2 = (value: unknown, fallback?: unknown) => {
  const raw = toTrimmedString(value)
  const selected = raw || toTrimmedString(fallback)
  const parsed = parseBoundedInteger(selected, 'JPL ID2', 1, 99)
  return String(parsed).padStart(2, '0')
}

export const normalizeJplId2OrZero = (
  value: unknown,
  fallback = JPL_ID_ZERO,
) => {
  const raw = toTrimmedString(value)
  const selected = raw || toTrimmedString(fallback)
  const parsed = parseBoundedInteger(selected, 'JPL ID2 or ID_ZERO', 0, 99)
  return String(parsed).padStart(2, '0')
}

export const normalizeJplDec2 = (value: unknown, fallback?: unknown) => {
  const normalized = normalizeJplFixedDecimal(value, 2, 'JPL DEC2', fallback)
  if (normalized === '00') {
    throw new Error('JPL DEC2 must be between 1 and 99')
  }
  return normalized
}

export const normalizeJplDec4 = (value: unknown, fallback?: unknown) =>
  normalizeJplFixedDecimal(value, 4, 'JPL DEC4', fallback)

export const normalizeJplDec6 = (
  value: unknown,
  fallback?: unknown,
  label = 'JPL DEC6',
) => normalizeJplFixedDecimal(value, 6, label, fallback)

export const normalizeJplDec10 = (
  value: unknown,
  fallback?: unknown,
  label = 'JPL DEC10',
) => normalizeJplFixedDecimal(value, 10, label, fallback)

export const normalizeJplDec2OrZero = (
  value: unknown,
  fallback: 0 | string = 0,
): 0 | string => {
  const raw = toTrimmedString(value)
  const selected = raw || toTrimmedString(fallback)
  const parsed = parseBoundedInteger(selected, 'JPL DEC2 or ZERO', 0, 99)
  return parsed === 0 ? 0 : String(parsed).padStart(2, '0')
}

export const normalizeJplCode1 = (value: unknown, fallback = '00H') => {
  const raw = toTrimmedString(value).toUpperCase()
  if (!raw) return fallback.toUpperCase()
  if (/^[0-9A-F]{2}H$/.test(raw)) return raw

  const hexMatch = raw.match(/^0X([0-9A-F]{1,2})$/)
  if (hexMatch) return `${hexMatch[1].padStart(2, '0')}H`

  const numeric = Number(raw.replace(/H$/, ''))
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 0xff) {
    return `${Math.trunc(numeric).toString(16).toUpperCase().padStart(2, '0')}H`
  }

  return fallback.toUpperCase()
}

export const normalizeJplCode2 = (value: unknown, fallback = '0000H') => {
  const raw = toTrimmedString(value).toUpperCase()
  if (!raw) return fallback.toUpperCase()
  if (/^[0-9A-F]{4}H$/.test(raw)) return raw

  const hexMatch = raw.match(/^0X([0-9A-F]{1,4})$/)
  if (hexMatch) return `${hexMatch[1].padStart(4, '0')}H`

  const numeric = Number(raw.replace(/H$/, ''))
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 0xffff) {
    return `${Math.trunc(numeric).toString(16).toUpperCase().padStart(4, '0')}H`
  }

  return fallback.toUpperCase()
}

export const normalizeJplFcDateTime = (
  value: unknown,
  fallback = JPL_FC_DATE_TIME_ZERO,
) => {
  const raw = toTrimmedString(value) || fallback
  if (!/^\d{14}$/.test(raw)) {
    throw new Error('JPL FC_DATE_AND_TIME must be a 14 digit string')
  }
  return raw
}

export const normalizeJplId2List = (value: unknown) => {
  if (!Array.isArray(value)) return undefined
  return value.map((entry) => normalizeJplId2(entry)).filter(Boolean)
}

export const normalizeJplPriceMatrix = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((entry) => toTrimmedString(entry)).filter(Boolean)
      : [],
  )
}

export const normalizeJplPriceSetType = (
  value: unknown,
  fallback: '00H' | '01H' = '00H',
) => {
  const normalized = normalizeJplCode1(value, fallback)
  return normalized === '01H' ? '01H' : '00H'
}

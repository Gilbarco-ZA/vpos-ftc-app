export const toNumberStrict = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''))
  return Number.isFinite(n) ? n : null
}

export const toNumberLoose = (value: unknown) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : null
}

export const toNumberOr = (value: unknown, fallback: number) => {
  const n = toNumberLoose(value)
  return n == null ? fallback : n
}

export const toBoolean = (value: unknown): boolean =>
  value === true ||
  String(value ?? '')
    .trim()
    .toLowerCase() === 'true'

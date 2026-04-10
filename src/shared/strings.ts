export const normalizeString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

export const pickString = (...values: unknown[]) => {
  for (const value of values) {
    const trimmed = normalizeString(value)
    if (trimmed) return trimmed
  }
  return ''
}

export const toOptionalString = (value: unknown) => {
  const v = String(value ?? '').trim()
  return v.length ? v : null
}

const DEFAULT_REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'sessionToken',
  'email',
  'phone',
  'ipAddress',
  'userAgent',
])

export const redactEmail = (value: string): string => {
  const [localPart, domain = ''] = value.split('@')
  if (!localPart) return '[redacted-email]'
  return `${localPart.slice(0, 1)}***@${domain || '***'}`
}

export const redactString = (value: string): string => {
  if (value.length <= 4) return '[redacted]'
  return `${value.slice(0, 2)}***${value.slice(-2)}`
}

export const redactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.includes('@') ? redactEmail(value) : redactString(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry))
  }

  if (value && typeof value === 'object') {
    return redactRecord(value as Record<string, unknown>)
  }

  return value
}

export const redactRecord = (
  input: Record<string, unknown>,
  redactedKeys: Iterable<string> = DEFAULT_REDACTED_KEYS,
): Record<string, unknown> => {
  const keys = new Set(Array.from(redactedKeys))

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (keys.has(key)) {
        return [key, '[redacted]']
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [key, redactRecord(value as Record<string, unknown>, keys)]
      }

      if (Array.isArray(value)) {
        return [key, value.map((entry) => redactValue(entry))]
      }

      return [key, value]
    }),
  )
}

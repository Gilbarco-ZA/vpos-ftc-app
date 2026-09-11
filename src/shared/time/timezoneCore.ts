export function isValidIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

export function deviceLocalTimezone(): string {
  const candidates = [
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    typeof process !== 'undefined' ? process.env?.TZ : undefined,
  ]

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim()
    if (value && isValidIanaTimezone(value)) return value
  }

  throw new Error(
    'Unable to resolve the device/runtime local timezone. Configure a valid timezone in /admin/setup Site Profile or configure the host runtime timezone.',
  )
}

export function resolveLocalTimezone(override?: unknown): string {
  const explicit = String(override ?? '').trim()
  if (!explicit) return deviceLocalTimezone()
  if (!isValidIanaTimezone(explicit)) {
    throw new Error(`Invalid site timezone override: ${explicit}`)
  }
  return explicit
}

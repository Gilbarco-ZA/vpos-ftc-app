export const readEnv = (name: string): string | undefined => {
  const value = process.env[name]
  return value == null ? undefined : String(value)
}

export const readTrimmedEnv = (name: string): string | undefined => {
  const value = readEnv(name)?.trim()
  return value ? value : undefined
}

export const readEnvOrDefault = (
  name: string,
  defaultValue: string,
): string => {
  return readTrimmedEnv(name) ?? defaultValue
}

export const readNumberEnv = (name: string, defaultValue: number): number => {
  const raw = readTrimmedEnv(name)
  if (!raw) return defaultValue

  const value = Number(raw)
  return Number.isFinite(value) ? value : defaultValue
}

export const readBooleanEnv = (
  name: string,
  defaultValue: boolean,
): boolean => {
  const raw = readTrimmedEnv(name)
  if (!raw) return defaultValue

  const normalized = raw.toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

export const hasEnvValue = (name: string): boolean => {
  return readTrimmedEnv(name) != null
}

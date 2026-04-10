export function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  return normalized
}

export function toPositiveInt(
  value: unknown,
  fallback: number,
  max = 1000,
): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export function ensurePlainObject<
  T extends Record<string, unknown> = Record<string, unknown>,
>(value: unknown, fallback: T = {} as T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fallback
  return value as T
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) =>
      typeof item === 'string' ? item.trim() : String(item ?? '').trim(),
    )
    .filter(Boolean)
}

export function optionalNonEmptyString(value: unknown): string | undefined {
  const normalized =
    typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  return normalized || undefined
}

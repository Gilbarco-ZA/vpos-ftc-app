import { AppError } from '@/src/shared/errors/AppError'

const normalizeSegment = (value: string | number): string => {
  return String(value).trim().replace(/\s+/g, '-')
}

export const buildIdempotencyKey = (
  ...parts: Array<string | number | null | undefined>
): string => {
  return parts
    .filter((part) => part != null && String(part).trim().length > 0)
    .map((part) => normalizeSegment(part as string | number))
    .join(':')
}

export const normalizeIdempotencyKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export const requireIdempotencyKey = (
  value: unknown,
  fieldName: string = 'idempotencyKey',
): string => {
  const normalized = normalizeIdempotencyKey(value)
  if (!normalized) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required`, 400)
  }

  return normalized
}

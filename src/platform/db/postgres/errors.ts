import { AppError } from '@/src/shared/errors/AppError'

export { AppError }
export type { ErrorCode } from '@/src/shared/errors/AppError'

export const POSTGRES_ERROR_CODES = {
  checkViolation: '23514',
  foreignKeyViolation: '23503',
  notNullViolation: '23502',
  uniqueViolation: '23505',
} as const

export type PostgresError = Error & {
  code?: string
  constraint?: string
  detail?: string
  table?: string
  column?: string
  schema?: string
}

export function isPostgresError(error: unknown): error is PostgresError {
  return !!error && typeof error === 'object' && 'code' in error
}

export function getPostgresErrorMeta(error: unknown) {
  if (!isPostgresError(error)) return null

  return {
    code: error.code ?? null,
    column: error.column ?? null,
    constraint: error.constraint ?? null,
    detail: error.detail ?? null,
    schema: error.schema ?? null,
    table: error.table ?? null,
  }
}

export function isUniqueViolation(error: unknown): error is PostgresError {
  return (
    isPostgresError(error) &&
    error.code === POSTGRES_ERROR_CODES.uniqueViolation
  )
}

export function toDatabaseError(
  error: unknown,
  fallbackMessage = 'Database request failed',
): AppError {
  if (error instanceof AppError) {
    return error
  }

  return new AppError(
    'INTERNAL_ERROR',
    fallbackMessage,
    500,
    getPostgresErrorMeta(error),
  )
}

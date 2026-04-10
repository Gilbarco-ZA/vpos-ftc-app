/**
 * Stable shared application error contract.
 *
 * Preserve the constructor shape while moving callers off legacy `lib/*`
 * imports. New shared/platform code should depend on this entrypoint.
 */
export const APP_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const

export type ErrorCode = (typeof APP_ERROR_CODES)[number]

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly status: number
  public readonly details?: any

  constructor(code: ErrorCode, message: string, status: number, details?: any) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details

    Object.setPrototypeOf(this, new.target.prototype)
  }
}

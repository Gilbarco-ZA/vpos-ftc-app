import { AppError } from '@/src/shared/errors'

export class AuthError extends AppError {
  public readonly statusCode: number

  constructor(message: string, statusCode: number = 401, details?: any) {
    super(
      statusCode === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED',
      message,
      statusCode,
      details,
    )
    this.name = 'AuthError'
    this.statusCode = statusCode
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

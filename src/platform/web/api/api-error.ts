import type { ErrorCode } from '@/src/shared/errors/AppError'

import { AppError } from '@/src/shared/errors/AppError'

export { AppError }
export type { ErrorCode }

export class ApiError extends AppError {}

export function createApiError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown,
): ApiError {
  return new ApiError(code, message, status, details)
}

export function badRequestError(message: string, details?: unknown): ApiError {
  return createApiError('VALIDATION_ERROR', message, 400, details)
}

export function unauthorizedError(
  message = 'Unauthorized',
  details?: unknown,
): ApiError {
  return createApiError('UNAUTHORIZED', message, 401, details)
}

export function forbiddenError(
  message = 'Forbidden',
  details?: unknown,
): ApiError {
  return createApiError('FORBIDDEN', message, 403, details)
}

export function notFoundError(
  message = 'Not found',
  details?: unknown,
): ApiError {
  return createApiError('NOT_FOUND', message, 404, details)
}

export function conflictError(message: string, details?: unknown): ApiError {
  return createApiError('CONFLICT', message, 409, details)
}

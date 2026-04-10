import { logger } from './logger'

/**
 * Execute an async operation, returning null on failure instead of throwing.
 * Failures are logged via the shared structured logger for observability.
 */
export async function safeAsync<T>(
  promise: Promise<T>,
  context?: string,
): Promise<T | null> {
  try {
    return await promise
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(context ?? 'safeAsync', { error: message })
    return null
  }
}

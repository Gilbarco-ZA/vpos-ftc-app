import { logServerError as platformLogServerError } from '@/src/platform/observability/errorLogger'

/**
 * Shared observability keeps a stable error logging surface for callers.
 * File/system log sinks remain platform-owned.
 */
export async function logServerError(
  params: Parameters<typeof platformLogServerError>[0],
) {
  return await platformLogServerError(params)
}

import { appendLogLine } from '@/src/shared/logs/service'

function nowIso() {
  return new Date().toISOString()
}

/**
 * Stable server-side error logger used by API/platform layers.
 */
export async function logServerError(params: {
  stationId?: string
  requestId: string
  message: string
  stack?: string
  meta?: any
}) {
  const line = JSON.stringify({
    ts: nowIso(),
    requestId: params.requestId,
    message: params.message,
    stack: params.stack,
    meta: params.meta ?? null,
  })

  if (!params.stationId) {
    console.error('[serverError]', line)
    return
  }

  try {
    await appendLogLine(params.stationId, 'live', 'errors.log', line)
  } catch (error) {
    console.error('[serverError] log write failed', {
      stationId: params.stationId,
      requestId: params.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
    console.error('[serverError]', line)
  }
}
